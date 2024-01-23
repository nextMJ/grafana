package notifier

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"hash/fnv"
	"slices"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/prometheus/alertmanager/pkg/labels"
	"github.com/prometheus/common/model"
	"golang.org/x/exp/maps"

	"github.com/grafana/grafana/pkg/infra/log"

	"github.com/grafana/grafana/pkg/services/ngalert/api/tooling/definitions"
	"github.com/grafana/grafana/pkg/services/ngalert/models"
)

type autogenRuleStore interface {
	ListNotificationSettings(ctx context.Context, orgID int64) (map[models.AlertRuleKey][]models.NotificationSettings, error)
}

func newAutogeneratedRoute(ctx context.Context, logger log.Logger, orgId int64, store autogenRuleStore, defaultReceiver string, validator notificaitonSettingsValidator) (autogeneratedRoute, error) {
	settings, err := store.ListNotificationSettings(ctx, orgId)
	if err != nil {
		return autogeneratedRoute{}, fmt.Errorf("failed to list alert rules: %w", err)
	}

	notificationSettings := make(map[data.Fingerprint]models.NotificationSettings)
	for ruleKey, ruleSettings := range settings {
		for _, setting := range ruleSettings {
			// TODO we should register this errors and somehow present to the users or make sure the config is always valid.
			if err = validator.Validate(setting); err != nil {
				logger.Error("Rule notification settings are invalid. Skipping", append(ruleKey.LogContext(), "error", err)...)
				continue
			}
			fp := setting.Fingerprint()
			// Keep only unique settings.
			if _, ok := notificationSettings[fp]; ok {
				continue
			}
			notificationSettings[fp] = setting
		}
	}
	if len(notificationSettings) == 0 {
		return autogeneratedRoute{}, nil
	}
	// TODO: Should we create all of the contact points routes regardless of whether they are used?
	newAutogenRoute, err := generateRouteFromSettings(defaultReceiver, notificationSettings)
	if err != nil {
		return autogeneratedRoute{}, fmt.Errorf("failed to create autogenerated route: %w", err)
	}
	return newAutogenRoute, nil
}

type autogeneratedRoute struct {
	Route       *definitions.Route
	Fingerprint data.Fingerprint
}

// generateRouteFromSettings generates a route and fingerprint of this route. The route is a tree of 3 layers:
// 1. with matcher by label models.AutogeneratedRouteLabel equals 'true'
// 2. with matcher by receiver name
// 3. with matcher by unique combination of optional settings. It is created only if there are optional settings
func generateRouteFromSettings(defaultReceiver string, settings map[data.Fingerprint]models.NotificationSettings) (autogeneratedRoute, error) {
	keys := maps.Keys(settings)
	// sort keys to make sure that the hash we calculate using it is stable
	slices.Sort(keys)

	rootMatcher, err := labels.NewMatcher(labels.MatchEqual, models.AutogeneratedRouteLabel, "true")
	if err != nil {
		return autogeneratedRoute{}, err
	}

	autoGenRoot := &definitions.Route{
		Receiver:       defaultReceiver,
		ObjectMatchers: definitions.ObjectMatchers{rootMatcher},
		Continue:       false, // We explicitly don't continue toward user-created routes if this matches.
	}

	receiverRoutes := make(map[string]*definitions.Route)
	for _, fingerprint := range keys {
		s := settings[fingerprint]
		receiverRoute, ok := receiverRoutes[s.Receiver]
		if !ok {
			contactMatcher, err := labels.NewMatcher(labels.MatchEqual, models.AutogeneratedRouteReceiverNameLabel, s.Receiver)
			if err != nil {
				return autogeneratedRoute{}, err
			}
			receiverRoute = &definitions.Route{
				Receiver:       s.Receiver,
				ObjectMatchers: definitions.ObjectMatchers{contactMatcher},
				// We continue on to check all other contact routes.
				Continue: true,
				// Since we'll have many rules from different folders using this policy, we ensure it has these necessary groupings.
				GroupByStr: []string{models.FolderTitleLabel, model.AlertNameLabel},
			}
			receiverRoutes[s.Receiver] = receiverRoute
			autoGenRoot.Routes = append(autoGenRoot.Routes, receiverRoute)
		}

		// Do not create hash specific route if all group settings such as mute timings, group_wait, group_interval, etc are default
		if s.IsAllDefault() {
			continue
		}
		settingMatcher, err := labels.NewMatcher(labels.MatchEqual, models.AutogeneratedRouteSettingsHashLabel, s.Fingerprint().String())
		if err != nil {
			return autogeneratedRoute{}, err
		}
		receiverRoute.Routes = append(receiverRoute.Routes, &definitions.Route{
			Receiver:       s.Receiver,
			ObjectMatchers: definitions.ObjectMatchers{settingMatcher},
			Continue:       false, // Only a single setting-specific route should match.

			GroupByStr:        s.GroupBy,
			MuteTimeIntervals: s.MuteTimeIntervals,
			GroupWait:         s.GroupWait,
			GroupInterval:     s.GroupInterval,
			RepeatInterval:    s.RepeatInterval,
		})
	}

	return autogeneratedRoute{
		Route:       autoGenRoot,
		Fingerprint: calculateAutogeneratedRouteHash(keys),
	}, nil
}

func calculateAutogeneratedRouteHash(fp []data.Fingerprint) data.Fingerprint {
	sum := fnv.New64()
	// this temp slice is used to convert ints to bytes.
	tmp := make([]byte, 8)
	write := func(fp data.Fingerprint) {
		binary.LittleEndian.PutUint64(tmp, uint64(fp))
		_, _ = sum.Write(tmp)
		_, _ = sum.Write([]byte{255})
	}
	for _, f := range fp {
		write(f)
	}
	return data.Fingerprint(sum.Sum64())
}

// AddToConfig adds this autogenerated route to the user-created route in the provided config.
func (ar *autogeneratedRoute) AddToConfig(config *definitions.PostableUserConfig) error {
	if config.AlertmanagerConfig.Route == nil {
		return errors.New("invalid Alertmanager configuration. The root route does not exist")
	}
	if ar == nil || ar.Route == nil {
		return nil
	}
	// Combine autogenerated route with the user-created route.
	ar.Route.Receiver = config.AlertmanagerConfig.Route.Receiver
	config.AlertmanagerConfig.Route.Routes = append([]*definitions.Route{ar.Route}, config.AlertmanagerConfig.Route.Routes...)
	return nil
}

type AutogeneratedRoute struct {
	Route        *definitions.Route
	baseSettings []models.NotificationSettings
	hash         data.Fingerprint
}
