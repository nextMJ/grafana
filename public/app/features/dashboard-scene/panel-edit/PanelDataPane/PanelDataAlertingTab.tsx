import { css } from '@emotion/css';
import React from 'react';

import { GrafanaTheme2, IconName } from '@grafana/data';
import { SceneObjectBase, SceneComponentProps, SceneQueryRunner } from '@grafana/scenes';
import { Alert, LoadingPlaceholder, useStyles2 } from '@grafana/ui';
import { contextSrv } from 'app/core/core';
import { RulesTable } from 'app/features/alerting/unified/components/rules/RulesTable';
import { usePanelCombinedRules } from 'app/features/alerting/unified/hooks/usePanelCombinedRules';
import { getRulesPermissions } from 'app/features/alerting/unified/utils/access-control';

import { getDashboardSceneFor, getPanelIdForVizPanel } from '../../utils/utils';
import { VizPanelManager } from '../VizPanelManager';

import { ScenesNewRuleFromPanelButton } from './NewAlertRuleButton';
import { PanelDataPaneTabState, PanelDataPaneTab, TabId } from './types';

export class PanelDataAlertingTab extends SceneObjectBase<PanelDataPaneTabState> implements PanelDataPaneTab {
  static Component = PanelDataAlertingTabRendered;

  tabId = TabId.Alert;
  icon: IconName = 'bell';
  private _panelManager: VizPanelManager;

  constructor(panelManager: VizPanelManager) {
    super({});
    this._panelManager = panelManager;
  }

  getTabLabel() {
    return 'Alert';
  }

  getDashboardUID() {
    const dashboard = getDashboardSceneFor(this._panelManager);
    return dashboard.state.uid!;
  }

  getDashboard() {
    return getDashboardSceneFor(this._panelManager);
  }

  getLegacyPanelId() {
    return getPanelIdForVizPanel(this._panelManager.state.panel);
  }

  getCanCreateRules() {
    const permissions = getRulesPermissions('grafana');
    return contextSrv.hasPermission(permissions.create);
  }

  get panelManager() {
    return this._panelManager;
  }

  get panel() {
    return this._panelManager.state.panel;
  }

  get queryRunner(): SceneQueryRunner {
    return this._panelManager.queryRunner;
  }
}

function PanelDataAlertingTabRendered(props: SceneComponentProps<PanelDataAlertingTab>) {
  const { model } = props;

  const styles = useStyles2(getStyles);

  const { errors, loading, rules } = usePanelCombinedRules({
    dashboardUID: model.getDashboardUID(),
    panelId: model.getLegacyPanelId(),
  });

  const alert = errors.length ? (
    <Alert title="Errors loading rules" severity="error">
      {errors.map((error, index) => (
        <div key={index}>Failed to load Grafana rules state: {error.message || 'Unknown error.'}</div>
      ))}
    </Alert>
  ) : null;

  if (loading && !rules.length) {
    return (
      <>
        {alert}
        <LoadingPlaceholder text="Loading rules..." />
      </>
    );
  }

  const dashboard = model.getDashboard();
  const { queryRunner, panel } = model;

  if (rules.length) {
    return (
      <>
        <RulesTable rules={rules} scenes={true} />
        {dashboard.state.meta.canSave && model.getCanCreateRules() && (
          <ScenesNewRuleFromPanelButton
            className={styles.newButton}
            panel={panel}
            dashboard={dashboard}
            queryRunner={queryRunner}
          />
        )}
      </>
    );
  }

  return (
    <div className={styles.noRulesWrapper}>
      <p>There are no alert rules linked to this panel.</p>
      <ScenesNewRuleFromPanelButton
        dashboard={dashboard}
        panel={panel}
        queryRunner={queryRunner}
      ></ScenesNewRuleFromPanelButton>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  newButton: css({
    marginTop: theme.spacing(3),
  }),
  noRulesWrapper: css({
    margin: theme.spacing(2),
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing(3),
  }),
});
