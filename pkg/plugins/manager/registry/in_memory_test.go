package registry

import (
	"context"
	"fmt"
	"sort"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/grafana/grafana/pkg/plugins"
)

const pluginUID = "test-ds"

func TestInMemory(t *testing.T) {
	t.Run("Test mix of registry operations", func(t *testing.T) {
		i := NewInMemory()
		ctx := context.Background()

		p, exists := i.Plugin(ctx, pluginUID)
		require.False(t, exists)
		require.Nil(t, p)

		err := i.Remove(ctx, pluginUID)
		require.EqualError(t, err, fmt.Errorf("plugin %s is not registered", pluginUID).Error())

		p = &plugins.Plugin{UID: pluginUID}
		err = i.Add(ctx, p)
		require.NoError(t, err)

		existingP, exists := i.Plugin(ctx, pluginUID)
		require.True(t, exists)
		require.Equal(t, p, existingP)

		err = i.Remove(ctx, pluginUID)
		require.NoError(t, err)

		existingPlugins := i.Plugins(ctx)
		require.Empty(t, existingPlugins)
	})
}

func TestInMemory_Add(t *testing.T) {
	type mocks struct {
		store map[string]*plugins.Plugin
	}
	type args struct {
		p *plugins.Plugin
	}
	var tests = []struct {
		name  string
		mocks mocks
		args  args
		err   error
	}{
		{
			name: "Can add a new plugin to the registry",
			mocks: mocks{
				store: map[string]*plugins.Plugin{},
			},
			args: args{
				p: &plugins.Plugin{
					UID: pluginUID,
				},
			},
		},
		{
			name: "Cannot add a plugin to the registry if it already exists",
			mocks: mocks{
				store: map[string]*plugins.Plugin{
					pluginUID: {
						UID: pluginUID,
					},
				},
			},
			args: args{
				p: &plugins.Plugin{
					UID: pluginUID,
				},
			},
			err: fmt.Errorf("plugin %s is already registered", pluginUID),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			i := &InMemory{
				store: tt.mocks.store,
			}
			err := i.Add(context.Background(), tt.args.p)
			require.Equal(t, tt.err, err)
		})
	}
}

func TestInMemory_Plugin(t *testing.T) {
	type mocks struct {
		store map[string]*plugins.Plugin
	}
	type args struct {
		pluginUID string
	}
	tests := []struct {
		name     string
		mocks    mocks
		args     args
		expected *plugins.Plugin
		exists   bool
	}{
		{
			name: "Can retrieve a plugin",
			mocks: mocks{
				store: map[string]*plugins.Plugin{
					pluginUID: {
						UID: pluginUID,
					},
				},
			},
			args: args{
				pluginUID: pluginUID,
			},
			expected: &plugins.Plugin{
				UID: pluginUID,
			},
			exists: true,
		},
		{
			name: "Non-existing plugin",
			mocks: mocks{
				store: map[string]*plugins.Plugin{},
			},
			args: args{
				pluginUID: pluginUID,
			},
			expected: nil,
			exists:   false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			i := &InMemory{
				store: tt.mocks.store,
			}
			p, exists := i.Plugin(context.Background(), tt.args.pluginUID)
			if exists != tt.exists {
				t.Errorf("Plugin() got1 = %v, expected %v", exists, tt.exists)
			}
			require.Equal(t, tt.expected, p)
		})
	}
}

func TestInMemory_Plugins(t *testing.T) {
	type mocks struct {
		store map[string]*plugins.Plugin
	}
	tests := []struct {
		name     string
		mocks    mocks
		expected []*plugins.Plugin
	}{
		{
			name: "Can retrieve a list of plugin",
			mocks: mocks{
				store: map[string]*plugins.Plugin{
					pluginUID: {
						UID: pluginUID,
					},
					"test-panel": {
						UID: "test-panel",
					},
				},
			},
			expected: []*plugins.Plugin{
				{
					UID: pluginUID,
				},
				{
					UID: "test-panel",
				},
			},
		},
		{
			name: "No existing plugins",
			mocks: mocks{
				store: map[string]*plugins.Plugin{},
			},
			expected: []*plugins.Plugin{},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			i := &InMemory{
				store: tt.mocks.store,
			}
			result := i.Plugins(context.Background())

			// to ensure we can compare with expected
			sort.SliceStable(result, func(i, j int) bool {
				return result[i].ID < result[j].ID
			})
			require.Equal(t, tt.expected, result)
		})
	}
}

func TestInMemory_Remove(t *testing.T) {
	type mocks struct {
		store map[string]*plugins.Plugin
	}
	type args struct {
		pluginID string
	}
	tests := []struct {
		name  string
		mocks mocks
		args  args
		err   error
	}{
		{
			name: "Can remove a plugin",
			mocks: mocks{
				store: map[string]*plugins.Plugin{
					pluginUID: {
						UID: pluginUID,
					},
				},
			},
			args: args{
				pluginID: pluginUID,
			},
		}, {
			name: "Cannot remove a plugin from the registry if it doesn't exist",
			mocks: mocks{
				store: map[string]*plugins.Plugin{},
			},
			args: args{
				pluginID: pluginUID,
			},
			err: fmt.Errorf("plugin %s is not registered", pluginUID),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			i := &InMemory{
				store: tt.mocks.store,
			}
			err := i.Remove(context.Background(), tt.args.pluginID)
			require.Equal(t, tt.err, err)
		})
	}
}

func TestAliasSupport(t *testing.T) {
	t.Run("Test alias operations", func(t *testing.T) {
		i := NewInMemory()
		ctx := context.Background()

		pluginUidNew := "plugin-new"
		pluginUidOld := "plugin-old"

		p, exists := i.Plugin(ctx, pluginUidNew)
		require.False(t, exists)
		require.Nil(t, p)

		pluginNew := &plugins.Plugin{
			UID:   pluginUidNew,
			Alias: pluginUidOld, // TODO: move to JSONData
		}
		err := i.Add(ctx, pluginNew)
		require.NoError(t, err)

		// Can lookup by the new ID
		found, exists := i.Plugin(ctx, pluginUidNew)
		require.True(t, exists)
		require.Equal(t, pluginNew, found)

		// Can lookup by the old ID
		found, exists = i.Plugin(ctx, pluginUidNew)
		require.True(t, exists)
		require.Equal(t, pluginNew, found)

		// Register the old plugin and look it up
		pluginOld := &plugins.Plugin{UID: pluginUidOld}
		require.NoError(t, i.Add(ctx, pluginOld))
		found, exists = i.Plugin(ctx, pluginUidOld)
		require.True(t, exists)
		require.Equal(t, pluginOld, found)
	})
}
