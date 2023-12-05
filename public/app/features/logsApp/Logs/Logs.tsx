import { css, cx } from '@emotion/css';
import { capitalize } from 'lodash';
import memoizeOne from 'memoize-one';
import React, { createRef, PureComponent } from 'react';

import {
  AbsoluteTimeRange,
  CoreApp,
  DataFrame,
  DataHoverClearEvent,
  DataHoverEvent,
  DataQueryResponse,
  DataSourceApi,
  EventBus,
  ExploreLogsPanelState,
  ExplorePanelsState,
  FeatureState,
  Field,
  GrafanaTheme2,
  LinkModel,
  LoadingState,
  LogRowContextOptions,
  LogRowModel,
  LogsDedupDescription,
  LogsDedupStrategy,
  LogsMetaItem,
  LogsSortOrder,
  rangeUtil,
  RawTimeRange,
  serializeStateToUrlParam,
  SplitOpen,
  SupplementaryQueryType,
  TimeRange,
  TimeZone,
  urlUtil,
} from '@grafana/data';
import { config, reportInteraction } from '@grafana/runtime';
import { DataQuery } from '@grafana/schema';
import {
  Button,
  FeatureBadge,
  InlineField,
  InlineFieldRow,
  InlineSwitch,
  PanelChrome,
  RadioButtonGroup,
  Themeable2,
  withTheme2,
} from '@grafana/ui';
import { SplitPaneWrapper } from 'app/core/components/SplitPaneWrapper/SplitPaneWrapper';
import store from 'app/core/store';
import { createAndCopyShortLink } from 'app/core/utils/shortLinks';
import { InfiniteScroll } from 'app/features/logs/components/InfiniteScroll';
import { getLogRowStyles } from 'app/features/logs/components/getLogRowStyles';
import { dispatch, getState } from 'app/store/store';

import { ExploreItemState } from '../../../types';
import { LogRows } from '../../logs/components/LogRows';
import { LogRowContextModal } from '../../logs/components/log-context/LogRowContextModal';
import { dedupLogRows, filterLogLevels } from '../../logs/logsModel';
import { getUrlStateFromPaneState } from '../hooks/useStateSync';
import { changePanelState } from '../state/explorePane';

import { LogDetails } from './LogDetails';
import { LogStats } from './LogStats';
import { LogsFeedback } from './LogsFeedback';
import { getLogsTableHeight, LogsTableWrap } from './LogsTableWrap';
import { LogsVolumePanelList } from './LogsVolumePanelList';
import { SETTINGS_KEYS } from './utils/logs';

interface Props extends Themeable2 {
  width: number;
  splitOpen: SplitOpen;
  logRows: LogRowModel[];
  logsMeta?: LogsMetaItem[];
  logsSeries?: DataFrame[];
  logsQueries?: DataQuery[];
  visibleRange?: AbsoluteTimeRange;
  theme: GrafanaTheme2;
  loading: boolean;
  loadingState: LoadingState;
  absoluteRange: AbsoluteTimeRange;
  timeZone: TimeZone;
  scanning?: boolean;
  scanRange?: RawTimeRange;
  exploreId: string;
  datasourceType?: string;
  logsVolumeEnabled: boolean;
  logsVolumeData: DataQueryResponse | undefined;
  logsCountEnabled: boolean;
  logsCountData: DataQueryResponse | undefined;
  logsCountWithGroupByData: DataQueryResponse | undefined;
  logsVolumeWithGroupByData: DataQueryResponse | undefined;
  onSetLogsVolumeEnabled: (enabled: boolean) => void;
  loadLogsVolumeData: (suppQueryType?: SupplementaryQueryType) => void;
  showContextToggle?: (row: LogRowModel) => boolean;
  onChangeTime: (range: AbsoluteTimeRange) => void;
  onClickFilterLabel?: (key: string, value: string, frame?: DataFrame) => void;
  onClickFilterOutLabel?: (key: string, value: string, frame?: DataFrame) => void;
  onStartScanning?: () => void;
  onStopScanning?: () => void;
  getRowContext?: (row: LogRowModel, origRow: LogRowModel, options: LogRowContextOptions) => Promise<any>;
  getRowContextQuery?: (row: LogRowModel, options?: LogRowContextOptions) => Promise<DataQuery | null>;
  getLogRowContextUi?: (row: LogRowModel, runContextQuery?: () => void) => React.ReactNode;
  getFieldLinks: (field: Field, rowIndex: number, dataFrame: DataFrame) => Array<LinkModel<Field>>;
  addResultsToCache: () => void;
  clearCache: () => void;
  eventBus: EventBus;
  panelState?: ExplorePanelsState;
  scrollElement?: HTMLDivElement;
  isFilterLabelActive?: (key: string, value: string, refId?: string) => Promise<boolean>;
  logsFrames?: DataFrame[];
  range: TimeRange;
  onClickFilterValue?: (value: string, refId?: string) => void;
  onClickFilterOutValue?: (value: string, refId?: string) => void;
  loadMoreLogs?(range: AbsoluteTimeRange): void;
  datasourceInstance: DataSourceApi<DataQuery>;
}

export type LogsVisualisationType = 'table' | 'logs';

interface State {
  showLabels: boolean;
  showTime: boolean;
  wrapLogMessage: boolean;
  prettifyLogMessage: boolean;
  dedupStrategy: LogsDedupStrategy;
  hiddenLogLevels: string[];
  logsSortOrder: LogsSortOrder;
  isFlipping: boolean;
  displayedFields: string[];
  forceEscape: boolean;
  contextOpen: boolean;
  contextRow?: LogRowModel;
  tableFrame?: DataFrame;
  visualisationType?: LogsVisualisationType;
  logsContainer?: HTMLDivElement;
  logDetailsRow: LogRowModel | undefined;
  groupByLabel?: string;
}

// we need to define the order of these explicitly
const DEDUP_OPTIONS = [
  LogsDedupStrategy.none,
  LogsDedupStrategy.exact,
  LogsDedupStrategy.numbers,
  LogsDedupStrategy.signature,
];

class UnthemedLogs extends PureComponent<Props, State> {
  flipOrderTimer?: number;
  cancelFlippingTimer?: number;
  topLogsRef = createRef<HTMLDivElement>();
  logsVolumeEventBus: EventBus;

  state: State = {
    showLabels: store.getBool(SETTINGS_KEYS.showLabels, false),
    showTime: store.getBool(SETTINGS_KEYS.showTime, true),
    wrapLogMessage: store.getBool(SETTINGS_KEYS.wrapLogMessage, true),
    prettifyLogMessage: store.getBool(SETTINGS_KEYS.prettifyLogMessage, false),
    dedupStrategy: LogsDedupStrategy.none,
    hiddenLogLevels: [],
    logsSortOrder: store.get(SETTINGS_KEYS.logsSortOrder) || LogsSortOrder.Descending,
    isFlipping: false,
    displayedFields: [],
    forceEscape: false,
    contextOpen: false,
    contextRow: undefined,
    tableFrame: undefined,
    visualisationType: this.props.panelState?.logs?.visualisationType ?? 'logs',
    logsContainer: undefined,
    logDetailsRow: undefined,
    groupByLabel: undefined,
  };

  constructor(props: Props) {
    super(props);
    this.logsVolumeEventBus = props.eventBus.newScopedBus('logsvolume', { onlyLocal: false });
  }

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeyPress);
  }

  componentWillUnmount() {
    if (this.flipOrderTimer) {
      window.clearTimeout(this.flipOrderTimer);
    }

    if (this.cancelFlippingTimer) {
      window.clearTimeout(this.cancelFlippingTimer);
    }

    // If we're unmounting logs (e.g. switching to another datasource), we need to remove the table specific panel state, otherwise it will persist in the explore url
    if (
      this.props?.panelState?.logs?.columns ||
      this.props?.panelState?.logs?.refId ||
      this.props?.panelState?.logs?.labelFieldName
    ) {
      dispatch(
        changePanelState(this.props.exploreId, 'logs', {
          ...this.props.panelState?.logs,
          columns: undefined,
          visualisationType: this.state.visualisationType,
          labelFieldName: undefined,
          refId: undefined,
        })
      );
    }

    document.removeEventListener('keydown', this.handleKeyPress);
  }

  updatePanelState = (logsPanelState: Partial<ExploreLogsPanelState>) => {
    const state: ExploreItemState | undefined = getState().explore.panes[this.props.exploreId];
    if (state?.panelsState) {
      dispatch(
        changePanelState(this.props.exploreId, 'logs', {
          ...state.panelsState.logs,
          columns: logsPanelState.columns ?? this.props.panelState?.logs?.columns,
          visualisationType: logsPanelState.visualisationType ?? this.state.visualisationType,
          labelFieldName: logsPanelState.labelFieldName,
          refId: logsPanelState.refId ?? this.props.panelState?.logs?.refId,
        })
      );
    }
  };

  componentDidUpdate(prevProps: Readonly<Props>): void {
    if (this.props.loading && !prevProps.loading && this.props.panelState?.logs?.id) {
      // loading stopped, so we need to remove any permalinked log lines
      delete this.props.panelState.logs.id;

      dispatch(
        changePanelState(this.props.exploreId, 'logs', {
          ...this.props.panelState,
        })
      );
    }
    if (this.props.panelState?.logs?.visualisationType !== prevProps.panelState?.logs?.visualisationType) {
      this.setState({
        visualisationType: this.props.panelState?.logs?.visualisationType ?? 'logs',
      });
    }
    if (this.state.logDetailsRow) {
      const included = this.props.logRows.includes(this.state.logDetailsRow);
      const found = this.props.logRows.findIndex((row) => row.rowId === this.state.logDetailsRow?.rowId);
      if (!included) {
        this.setState({
          logDetailsRow: found ? this.props.logRows[found] : undefined,
        });
      }
    }
  }

  onLogRowHover = (row?: LogRowModel) => {
    if (!row) {
      this.props.eventBus.publish(new DataHoverClearEvent());
    } else {
      this.props.eventBus.publish(
        new DataHoverEvent({
          point: {
            time: row.timeEpochMs,
          },
        })
      );
    }
  };

  onLogsContainerRef = (node: HTMLDivElement) => {
    this.setState({ logsContainer: node });
  };

  onChangeLogsSortOrder = () => {
    this.setState({ isFlipping: true });
    // we are using setTimeout here to make sure that disabled button is rendered before the rendering of reordered logs
    this.flipOrderTimer = window.setTimeout(() => {
      this.setState((prevState) => {
        const newSortOrder =
          prevState.logsSortOrder === LogsSortOrder.Descending ? LogsSortOrder.Ascending : LogsSortOrder.Descending;
        store.set(SETTINGS_KEYS.logsSortOrder, newSortOrder);
        return { logsSortOrder: newSortOrder };
      });
    }, 0);
    this.cancelFlippingTimer = window.setTimeout(() => this.setState({ isFlipping: false }), 1000);
  };

  onEscapeNewlines = () => {
    this.setState((prevState) => ({
      forceEscape: !prevState.forceEscape,
    }));
  };

  onChangeVisualisation = (visualisation: LogsVisualisationType) => {
    this.setState(() => ({
      visualisationType: visualisation,
    }));
    const payload = {
      ...this.props.panelState?.logs,
      visualisationType: visualisation,
    };
    this.updatePanelState(payload);

    reportInteraction('grafana_explore_logs_visualisation_changed', {
      newVisualizationType: visualisation,
      datasourceType: this.props.datasourceType ?? 'unknown',
    });
  };

  onChangeDedup = (dedupStrategy: LogsDedupStrategy) => {
    reportInteraction('grafana_explore_logs_deduplication_clicked', {
      deduplicationType: dedupStrategy,
      datasourceType: this.props.datasourceType,
    });
    this.setState({ dedupStrategy });
  };

  onChangeLabels = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { target } = event;
    if (target) {
      const showLabels = target.checked;
      this.setState({
        showLabels,
      });
      store.set(SETTINGS_KEYS.showLabels, showLabels);
    }
  };

  onChangeTime = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { target } = event;
    if (target) {
      const showTime = target.checked;
      this.setState({
        showTime,
      });
      store.set(SETTINGS_KEYS.showTime, showTime);
    }
  };

  onChangeWrapLogMessage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { target } = event;
    if (target) {
      const wrapLogMessage = target.checked;
      this.setState({
        wrapLogMessage,
      });
      store.set(SETTINGS_KEYS.wrapLogMessage, wrapLogMessage);
    }
  };

  onChangePrettifyLogMessage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { target } = event;
    if (target) {
      const prettifyLogMessage = target.checked;
      this.setState({
        prettifyLogMessage,
      });
      store.set(SETTINGS_KEYS.prettifyLogMessage, prettifyLogMessage);
    }
  };

  onToggleLogLevel = (hiddenRawLevels: string[]) => {
    // const hiddenLogLevels = hiddenRawLevels.map((level) => LogLevel[level as LogLevel]);
    this.setState({ hiddenLogLevels: hiddenRawLevels });
  };

  onChangeGroupByLabel = (groupByLabel?: string) => {
    this.setState({ groupByLabel });
  };

  onToggleLogsVolumeCollapse = (collapsed: boolean) => {
    this.props.onSetLogsVolumeEnabled(!collapsed);
    reportInteraction('grafana_explore_logs_histogram_toggle_clicked', {
      datasourceType: this.props.datasourceType,
      type: !collapsed ? 'open' : 'close',
    });
  };

  onClickScan = (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (this.props.onStartScanning) {
      this.props.onStartScanning();
      reportInteraction('grafana_explore_logs_scanning_button_clicked', {
        type: 'start',
        datasourceType: this.props.datasourceType,
      });
    }
  };

  onClickStopScan = (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (this.props.onStopScanning) {
      this.props.onStopScanning();
    }
  };

  showField = (key: string) => {
    const index = this.state.displayedFields.indexOf(key);

    if (index === -1) {
      this.setState((state) => {
        return {
          displayedFields: state.displayedFields.concat(key),
        };
      });
    }
  };

  hideField = (key: string) => {
    const index = this.state.displayedFields.indexOf(key);
    if (index > -1) {
      this.setState((state) => {
        return {
          displayedFields: state.displayedFields.filter((k) => key !== k),
        };
      });
    }
  };

  clearDetectedFields = () => {
    this.setState((state) => {
      return {
        displayedFields: [],
      };
    });
  };

  onCloseContext = () => {
    this.setState({
      contextOpen: false,
      contextRow: undefined,
    });
  };

  onOpenContext = (row: LogRowModel, onClose: () => void) => {
    // we are setting the `contextOpen` open state and passing it down to the `LogRow` in order to highlight the row when a LogContext is open
    this.setState({
      contextOpen: true,
      contextRow: row,
    });
    reportInteraction('grafana_explore_logs_log_context_opened', {
      datasourceType: row.datasourceType,
      logRowUid: row.uid,
    });
    this.onCloseContext = () => {
      this.setState({
        contextOpen: false,
        contextRow: undefined,
      });
      reportInteraction('grafana_explore_logs_log_context_closed', {
        datasourceType: row.datasourceType,
        logRowUid: row.uid,
      });
      onClose();
    };
  };

  onPermalinkClick = async (row: LogRowModel) => {
    // this is an extra check, to be sure that we are not
    // creating permalinks for logs without an id-field.
    // normally it should never happen, because we do not
    // display the permalink button in such cases.
    if (row.rowId === undefined) {
      return;
    }

    // get explore state, add log-row-id and make timerange absolute
    const urlState = getUrlStateFromPaneState(getState().explore.panes[this.props.exploreId]!);
    urlState.panelsState = {
      ...this.props.panelState,
      logs: { id: row.uid, visualisationType: this.state.visualisationType ?? 'logs' },
    };
    urlState.range = {
      from: new Date(this.props.absoluteRange.from).toISOString(),
      to: new Date(this.props.absoluteRange.to).toISOString(),
    };

    // append changed urlState to baseUrl
    const serializedState = serializeStateToUrlParam(urlState);
    const baseUrl = /.*(?=\/explore)/.exec(`${window.location.href}`)![0];
    const url = urlUtil.renderUrl(`${baseUrl}/explore`, { left: serializedState });
    await createAndCopyShortLink(url);

    reportInteraction('grafana_explore_logs_permalink_clicked', {
      datasourceType: row.datasourceType ?? 'unknown',
      logRowUid: row.uid,
      logRowLevel: row.logLevel,
    });
  };

  scrollIntoView = (element: HTMLElement) => {
    if (config.featureToggles.logsInfiniteScrolling) {
      if (this.state.logsContainer) {
        this.topLogsRef.current?.scrollIntoView();
        this.state.logsContainer.scroll({
          behavior: 'smooth',
          top: this.state.logsContainer.scrollTop + element.getBoundingClientRect().top - window.innerHeight / 2,
        });
      }

      return;
    }
    const { scrollElement } = this.props;

    if (scrollElement) {
      scrollElement.scroll({
        behavior: 'smooth',
        top: scrollElement.scrollTop + element.getBoundingClientRect().top - window.innerHeight / 2,
      });
    }
  };

  checkUnescapedContent = memoizeOne((logRows: LogRowModel[]) => {
    return !!logRows.some((r) => r.hasUnescapedContent);
  });

  dedupRows = memoizeOne((logRows: LogRowModel[], dedupStrategy: LogsDedupStrategy) => {
    const dedupedRows = dedupLogRows(logRows, dedupStrategy);
    const dedupCount = dedupedRows.reduce((sum, row) => (row.duplicates ? sum + row.duplicates : sum), 0);
    return { dedupedRows, dedupCount };
  });

  filterRows = memoizeOne((logRows: LogRowModel[], hiddenLogLevels: string[], groupByLabel?: string) => {
    return filterLogLevels(logRows, new Set(hiddenLogLevels), groupByLabel);
  });

  createNavigationRange = memoizeOne((logRows: LogRowModel[]): { from: number; to: number } | undefined => {
    if (!logRows || logRows.length === 0) {
      return undefined;
    }
    const firstTimeStamp = logRows[0].timeEpochMs;
    const lastTimeStamp = logRows[logRows.length - 1].timeEpochMs;

    if (lastTimeStamp < firstTimeStamp) {
      return { from: lastTimeStamp, to: firstTimeStamp };
    }

    return { from: firstTimeStamp, to: lastTimeStamp };
  });

  scrollToTopLogs = () => {
    if (config.featureToggles.logsInfiniteScrolling) {
      if (this.state.logsContainer) {
        this.state.logsContainer.scroll({
          behavior: 'auto',
          top: 0,
        });
      }
    }
    this.topLogsRef.current?.scrollIntoView();
  };

  showDetails = (row: LogRowModel) => {
    this.setState({
      logDetailsRow: row,
    });
  };

  handleKeyPress = (e: KeyboardEvent) => {
    if (!this.state.logDetailsRow) {
      return;
    }
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) {
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    const currentIndex = this.props.logRows.indexOf(this.state.logDetailsRow);
    if (!currentIndex) {
      this.setState({
        logDetailsRow: undefined,
      });
      return;
    }
    let newIndex = currentIndex + delta;
    if (newIndex < 0) {
      newIndex = this.props.logRows.length - 1;
    } else if (newIndex + 1 >= this.props.logRows.length) {
      newIndex = 0;
    }
    const logDetailsRow = this.props.logRows[newIndex];
    this.setState({
      logDetailsRow,
    });
    document.getElementById(`row-${logDetailsRow.rowId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  };

  render() {
    const {
      width,
      splitOpen,
      logRows,
      logsVolumeEnabled,
      logsVolumeData,
      logsCountEnabled,
      logsCountData,
      logsCountWithGroupByData,
      logsVolumeWithGroupByData,
      loadLogsVolumeData,
      loading = false,
      onClickFilterLabel,
      onClickFilterOutLabel,
      timeZone,
      scanning,
      scanRange,
      showContextToggle,
      absoluteRange,
      onChangeTime,
      getFieldLinks,
      theme,
      exploreId,
      getRowContext,
      getLogRowContextUi,
      getRowContextQuery,
      loadMoreLogs,
    } = this.props;

    const {
      showLabels,
      showTime,
      wrapLogMessage,
      prettifyLogMessage,
      dedupStrategy,
      hiddenLogLevels,
      logsSortOrder,
      isFlipping,
      displayedFields,
      forceEscape,
      contextOpen,
      contextRow,
    } = this.state;

    const tableHeight = getLogsTableHeight();
    const styles = getStyles(theme, wrapLogMessage, tableHeight);
    const logRowStyles = getLogRowStyles(theme);
    const hasData = logRows && logRows.length > 0;

    const filteredLogs = this.filterRows(logRows, hiddenLogLevels, this.state.groupByLabel);
    const { dedupedRows } = this.dedupRows(filteredLogs, dedupStrategy);
    const paneSize = (window.innerWidth / 4) * 3;

    const scanText = scanRange ? `Scanning ${rangeUtil.describeTimeRange(scanRange)}` : 'Scanning...';
    let title =
      logsVolumeData?.data || logsVolumeWithGroupByData?.data
        ? 'Count over time'
        : logsCountData?.data || logsCountWithGroupByData?.data
        ? 'Total count'
        : 'Log metrics';
    title = `${title}${
      this.state.hiddenLogLevels.length > 0 ? ` (filtered based on selected ${this.state.groupByLabel})` : ''
    }`;

    return (
      <>
        {getRowContext && contextRow && (
          <LogRowContextModal
            open={contextOpen}
            row={contextRow}
            onClose={this.onCloseContext}
            getRowContext={(row, options) => getRowContext(row, contextRow, options)}
            getRowContextQuery={getRowContextQuery}
            getLogRowContextUi={getLogRowContextUi}
            logsSortOrder={logsSortOrder}
            timeZone={timeZone}
          />
        )}
        <PanelChrome
          title={title}
          collapsible
          collapsed={!logsVolumeEnabled}
          onToggleCollapse={this.onToggleLogsVolumeCollapse}
          height={210}
          width={width + 16}
        >
          {(w, h) =>
            logsVolumeEnabled || logsCountEnabled ? (
              <LogsVolumePanelList
                absoluteRange={absoluteRange}
                width={w}
                logsVolumeData={logsVolumeData}
                logsCountData={logsCountData}
                logsCountWithGroupByData={logsCountWithGroupByData}
                logsVolumeWithGroupByData={logsVolumeWithGroupByData}
                onUpdateTimeRange={onChangeTime}
                timeZone={timeZone}
                splitOpen={splitOpen}
                onLoadLogsVolume={loadLogsVolumeData}
                onHiddenSeriesChanged={this.onToggleLogLevel}
                onChangeGroupByLabel={this.onChangeGroupByLabel}
                groupByLabel={this.state.groupByLabel}
                eventBus={this.logsVolumeEventBus}
                onClose={() => this.onToggleLogsVolumeCollapse(true)}
                datasourceInstance={this.props.datasourceInstance}
              />
            ) : (
              <></>
            )
          }
        </PanelChrome>
        <PanelChrome
          titleItems={[
            config.featureToggles.logsExploreTableVisualisation
              ? this.state.visualisationType === 'logs'
                ? null
                : [
                    <PanelChrome.TitleItem title="Experimental" key="A">
                      <FeatureBadge
                        featureState={FeatureState.beta}
                        tooltip="Table view is experimental and may change in future versions"
                      />
                    </PanelChrome.TitleItem>,
                    <PanelChrome.TitleItem title="Feedback" key="B">
                      <LogsFeedback feedbackUrl="https://forms.gle/5YyKdRQJ5hzq4c289" />
                    </PanelChrome.TitleItem>,
                  ]
              : null,
          ]}
          title={`Logs${
            this.state.hiddenLogLevels.length > 0 ? ` (filtered based on selected ${this.state.groupByLabel})` : ''
          }`}
          actions={
            <>
              {config.featureToggles.logsExploreTableVisualisation && (
                <div className={styles.visualisationType}>
                  <RadioButtonGroup
                    className={styles.visualisationTypeRadio}
                    options={[
                      {
                        label: 'Logs',
                        value: 'logs',
                        description: 'Show results in logs visualisation',
                      },
                      {
                        label: 'Table',
                        value: 'table',
                        description: 'Show results in table visualisation',
                      },
                    ]}
                    size="sm"
                    value={this.state.visualisationType}
                    onChange={this.onChangeVisualisation}
                  />
                </div>
              )}
            </>
          }
          loadingState={loading ? LoadingState.Loading : LoadingState.Done}
        >
          <div className={styles.stickyNavigation}>
            {this.state.visualisationType !== 'table' && (
              <div className={styles.logOptions}>
                <InlineFieldRow>
                  <InlineField label="Time" className={styles.horizontalInlineLabel} transparent>
                    <InlineSwitch
                      value={showTime}
                      onChange={this.onChangeTime}
                      className={styles.horizontalInlineSwitch}
                      transparent
                      id={`show-time_${exploreId}`}
                    />
                  </InlineField>
                  <InlineField label="Unique labels" className={styles.horizontalInlineLabel} transparent>
                    <InlineSwitch
                      value={showLabels}
                      onChange={this.onChangeLabels}
                      className={styles.horizontalInlineSwitch}
                      transparent
                      id={`unique-labels_${exploreId}`}
                    />
                  </InlineField>
                  <InlineField label="Wrap lines" className={styles.horizontalInlineLabel} transparent>
                    <InlineSwitch
                      value={wrapLogMessage}
                      onChange={this.onChangeWrapLogMessage}
                      className={styles.horizontalInlineSwitch}
                      transparent
                      id={`wrap-lines_${exploreId}`}
                    />
                  </InlineField>
                  <InlineField label="Prettify JSON" className={styles.horizontalInlineLabel} transparent>
                    <InlineSwitch
                      value={prettifyLogMessage}
                      onChange={this.onChangePrettifyLogMessage}
                      className={styles.horizontalInlineSwitch}
                      transparent
                      id={`prettify_${exploreId}`}
                    />
                  </InlineField>
                  <InlineField label="Deduplication" className={styles.horizontalInlineLabel} transparent>
                    <RadioButtonGroup
                      options={DEDUP_OPTIONS.map((dedupType) => ({
                        label: capitalize(dedupType),
                        value: dedupType,
                        description: LogsDedupDescription[dedupType],
                      }))}
                      value={dedupStrategy}
                      onChange={this.onChangeDedup}
                      className={styles.radioButtons}
                    />
                  </InlineField>
                </InlineFieldRow>

                <div>
                  <InlineField label="Display results" className={styles.horizontalInlineLabel} transparent>
                    <RadioButtonGroup
                      disabled={isFlipping}
                      options={[
                        {
                          label: 'Newest first',
                          value: LogsSortOrder.Descending,
                          description: 'Show results newest to oldest',
                        },
                        {
                          label: 'Oldest first',
                          value: LogsSortOrder.Ascending,
                          description: 'Show results oldest to newest',
                        },
                      ]}
                      value={logsSortOrder}
                      onChange={this.onChangeLogsSortOrder}
                      className={styles.radioButtons}
                    />
                  </InlineField>
                </div>
              </div>
            )}
            <div ref={this.topLogsRef} />
          </div>
          <div
            className={cx(styles.logsSection, this.state.visualisationType === 'table' ? styles.logsTable : undefined)}
          >
            <SplitPaneWrapper splitOrientation="vertical" paneSize={paneSize} parentStyle={{ position: 'relative' }}>
              <div className={styles.logsColumn}>
                {this.state.visualisationType === 'table' && hasData && (
                  <div className={styles.logRows} data-testid="logRowsTable">
                    {/* Width should be full width minus logs navigation and padding */}
                    <LogsTableWrap
                      logsSortOrder={this.state.logsSortOrder}
                      range={this.props.range}
                      splitOpen={this.props.splitOpen}
                      timeZone={timeZone}
                      width={width - 80}
                      logsFrames={this.props.logsFrames ?? []}
                      onClickFilterLabel={onClickFilterLabel}
                      onClickFilterOutLabel={onClickFilterOutLabel}
                      panelState={this.props.panelState?.logs}
                      theme={theme}
                      updatePanelState={this.updatePanelState}
                      datasourceType={this.props.datasourceType}
                    />
                  </div>
                )}
                {this.state.visualisationType === 'logs' && hasData && (
                  <div
                    className={config.featureToggles.logsInfiniteScrolling ? styles.scrollableLogRows : styles.logRows}
                    data-testid="logRows"
                    ref={this.onLogsContainerRef}
                  >
                    <InfiniteScroll
                      loading={loading}
                      loadMoreLogs={loadMoreLogs}
                      range={this.props.range}
                      timeZone={timeZone}
                      rows={logRows}
                      scrollElement={this.state.logsContainer}
                      sortOrder={logsSortOrder}
                    >
                      <LogRows
                        logRows={logRows}
                        deduplicatedRows={dedupedRows}
                        dedupStrategy={dedupStrategy}
                        onClickFilterLabel={onClickFilterLabel}
                        onClickFilterOutLabel={onClickFilterOutLabel}
                        showContextToggle={showContextToggle}
                        showLabels={showLabels}
                        showTime={showTime}
                        enableLogDetails={true}
                        forceEscape={forceEscape}
                        wrapLogMessage={wrapLogMessage}
                        prettifyLogMessage={prettifyLogMessage}
                        timeZone={timeZone}
                        getFieldLinks={getFieldLinks}
                        logsSortOrder={logsSortOrder}
                        displayedFields={displayedFields}
                        onClickShowField={this.showField}
                        onClickHideField={this.hideField}
                        app={CoreApp.Explore}
                        onLogRowHover={this.onLogRowHover}
                        onOpenContext={this.onOpenContext}
                        onPermalinkClick={this.onPermalinkClick}
                        permalinkedRowId={this.props.panelState?.logs?.id}
                        scrollIntoView={this.scrollIntoView}
                        isFilterLabelActive={this.props.isFilterLabelActive}
                        containerRendered={!!this.state.logsContainer}
                        onClickFilterValue={this.props.onClickFilterValue}
                        onClickFilterOutValue={this.props.onClickFilterOutValue}
                        showDetails={this.showDetails}
                        logDetailsRow={this.state.logDetailsRow}
                      />
                    </InfiniteScroll>
                  </div>
                )}

                {!loading && !hasData && !scanning && (
                  <div className={styles.logRows}>
                    <div className={styles.noData}>
                      No logs found.
                      <Button size="sm" variant="secondary" onClick={this.onClickScan}>
                        Scan for older logs
                      </Button>
                    </div>
                  </div>
                )}
                {scanning && (
                  <div className={styles.logRows}>
                    <div className={styles.noData}>
                      <span>{scanText}</span>
                      <Button size="sm" variant="secondary" onClick={this.onClickStopScan}>
                        Stop scan
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                {this.state.logDetailsRow ? (
                  <LogDetails
                    showDuplicates={false}
                    getFieldLinks={getFieldLinks}
                    onClickFilterLabel={onClickFilterLabel}
                    onClickFilterOutLabel={onClickFilterOutLabel}
                    onClickShowField={this.showField}
                    onClickHideField={this.hideField}
                    rows={logRows}
                    row={this.state.logDetailsRow}
                    wrapLogMessage={wrapLogMessage}
                    hasError={false}
                    displayedFields={displayedFields}
                    app={CoreApp.Explore}
                    styles={logRowStyles}
                    isFilterLabelActive={this.props.isFilterLabelActive}
                  />
                ) : (
                  <LogStats styles={logRowStyles} rows={logRows} />
                )}
              </div>
            </SplitPaneWrapper>
          </div>
        </PanelChrome>
      </>
    );
  }
}

export const Logs = withTheme2(UnthemedLogs);

const getStyles = (theme: GrafanaTheme2, wrapLogMessage: boolean, tableHeight: number) => {
  return {
    logsColumn: css({}),
    noData: css({
      '& > *': {
        marginLeft: '0.5em',
      },
    }),
    logOptions: css({
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      backgroundColor: theme.colors.background.primary,
      padding: `${theme.spacing(1)} ${theme.spacing(2)}`,
      borderRadius: theme.shape.radius.default,
      margin: `${theme.spacing(0, 0, 1)}`,
      border: `1px solid ${theme.colors.border.medium}`,
    }),
    headerButton: css({
      margin: `${theme.spacing(0.5, 0, 0, 1)}`,
    }),
    horizontalInlineLabel: css({
      '& > label': {
        marginRight: '0',
      },
    }),
    horizontalInlineSwitch: css({
      padding: `0 ${theme.spacing(1)} 0 0`,
    }),
    radioButtons: css({
      margin: '0',
    }),
    logsSection: css({}),
    logsTable: css({
      maxHeight: `${tableHeight}px`,
    }),
    scrollableLogRows: css({
      overflowX: 'scroll',
      overflowY: 'visible',
      width: '100%',
      maxHeight: '75vh',
    }),
    logRows: css({
      overflowX: `${wrapLogMessage ? 'unset' : 'scroll'}`,
      overflowY: 'visible',
      width: '100%',
    }),
    visualisationType: css({
      display: 'flex',
      flex: '1',
      justifyContent: 'space-between',
    }),
    visualisationTypeRadio: css({
      margin: `0 0 0 ${theme.spacing(1)}`,
    }),
    stickyNavigation: css({
      overflow: 'visible',
      ...(config.featureToggles.logsInfiniteScrolling && { marginBottom: '0px' }),
    }),
  };
};