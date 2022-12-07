import { AnyAction } from '@reduxjs/toolkit';
import React, { useEffect, useState } from 'react';

import {
  CoreApp,
  DataCatalogueContextWithExploreLinkBuilder,
  DataCatalogueItem,
  DataQuery,
  DataSourceApi,
  DataSourcePluginContextProvider,
  DataSourcePluginMeta,
  DataSourceSettings as DataSourceSettingsType,
  withDataCatalogueSupport,
} from '@grafana/data';
import { getDataSourceSrv, locationService } from '@grafana/runtime';
import PageLoader from 'app/core/components/PageLoader/PageLoader';
import { DataSourceSettingsState, useDispatch } from 'app/types';

import { DataCatalogue } from '../../data-catalogue';
import { DatasourceDataCatalogueBuilder } from '../../data-catalogue/utils/datasource';
import {
  dataSourceLoaded,
  setDataSourceName,
  setIsDefault,
  useDataSource,
  useDataSourceApi,
  useDataSourceExploreUrl,
  useDataSourceMeta,
  useDataSourceRights,
  useDataSourceSettings,
  useDeleteLoadedDataSource,
  useInitDataSourceSettings,
  useLoadDataSourceApi,
  useTestDataSource,
  useUpdateDatasource,
} from '../state';
import { DataSourceRights } from '../types';
import { constructDataSourceExploreUrl } from '../utils';

import { BasicSettings } from './BasicSettings';
import { ButtonRow } from './ButtonRow';
import { CloudInfoBox } from './CloudInfoBox';
import { DataSourceLoadError } from './DataSourceLoadError';
import { DataSourceMissingRightsMessage } from './DataSourceMissingRightsMessage';
import { DataSourcePluginConfigPage } from './DataSourcePluginConfigPage';
import { DataSourcePluginSettings } from './DataSourcePluginSettings';
import { DataSourcePluginState } from './DataSourcePluginState';
import { DataSourceReadOnlyMessage } from './DataSourceReadOnlyMessage';
import { DataSourceTestingStatus } from './DataSourceTestingStatus';

export type Props = {
  // The ID of the data source
  uid: string;
  // The ID of the custom datasource setting page
  pageId?: string | null;
};

export function EditDataSource({ uid, pageId }: Props) {
  useInitDataSourceSettings(uid);

  const dispatch = useDispatch();
  const dataSource = useDataSource(uid);
  const dataSourceMeta = useDataSourceMeta(dataSource.type);
  const dataSourceSettings = useDataSourceSettings();
  const dataSourceRights = useDataSourceRights(uid);
  const exploreUrl = useDataSourceExploreUrl(uid);
  const onDelete = useDeleteLoadedDataSource();
  const onTest = useTestDataSource(uid);
  const onUpdate = useUpdateDatasource();
  const dataSourceApi = useDataSourceApi();
  const loadDataSourceApi = useLoadDataSourceApi();
  const onDefaultChange = (value: boolean) => dispatch(setIsDefault(value));
  const onNameChange = (name: string) => dispatch(setDataSourceName(name));
  const onOptionsChange = (ds: DataSourceSettingsType) => dispatch(dataSourceLoaded(ds));

  return (
    <EditDataSourceView
      pageId={pageId}
      dataSource={dataSource}
      dataSourceMeta={dataSourceMeta}
      dataSourceSettings={dataSourceSettings}
      dataSourceRights={dataSourceRights}
      dataSourceApi={dataSourceApi}
      loadDataSourceApi={loadDataSourceApi}
      exploreUrl={exploreUrl}
      onDelete={onDelete}
      onDefaultChange={onDefaultChange}
      onNameChange={onNameChange}
      onOptionsChange={onOptionsChange}
      onTest={onTest}
      onUpdate={onUpdate}
    />
  );
}

export type ViewProps = {
  pageId?: string | null;
  dataSourceApi?: DataSourceApi;
  dataSource: DataSourceSettingsType;
  dataSourceMeta: DataSourcePluginMeta;
  dataSourceSettings: DataSourceSettingsState;
  dataSourceRights: DataSourceRights;
  exploreUrl?: string;
  loadDataSourceApi: () => void;
  onDelete: () => void;
  onDefaultChange: (isDefault: boolean) => AnyAction;
  onNameChange: (name: string) => AnyAction;
  onOptionsChange: (dataSource: DataSourceSettingsType) => AnyAction;
  onTest: () => void;
  onUpdate: (dataSource: DataSourceSettingsType) => Promise<DataSourceSettingsType>;
};

export function EditDataSourceView({
  pageId,
  dataSourceApi,
  dataSource,
  dataSourceMeta,
  dataSourceSettings,
  dataSourceRights,
  exploreUrl,
  loadDataSourceApi,
  onDelete,
  onDefaultChange,
  onNameChange,
  onOptionsChange,
  onTest,
  onUpdate,
}: ViewProps) {
  const { plugin, loadError, testingStatus, loading } = dataSourceSettings;
  const { readOnly, hasWriteRights, hasDeleteRights } = dataSourceRights;
  const hasDataSource = dataSource.id > 0;

  const dsi = getDataSourceSrv()?.getInstanceSettings(dataSource.uid);

  const hasAlertingEnabled = Boolean(dsi?.meta?.alerting ?? false);
  const isAlertManagerDatasource = dsi?.type === 'alertmanager';
  const alertingSupported = hasAlertingEnabled || isAlertManagerDatasource;

  const [dataCatalogueRootItem, setDataCatalogueRootItem] = useState<DataCatalogueItem | undefined>();
  const [pendingExploreDisplay, setPendingExploreDisplay] = useState(false);

  const onExplore = () => {
    setPendingExploreDisplay(true);
    loadDataSourceApi();
  };

  useEffect(() => {
    if (pendingExploreDisplay && dataSourceApi) {
      setPendingExploreDisplay(false);
      if (withDataCatalogueSupport(dataSourceApi)) {
        const dataCatalogueContext: DataCatalogueContextWithExploreLinkBuilder = {
          app: CoreApp.Unknown,
          closeDataCatalogue: () => {
            setDataCatalogueRootItem(undefined);
          },
          createExploreUrl: (queries: DataQuery[]) => {
            return constructDataSourceExploreUrl(dataSource, queries);
          },
        };
        const dataCatalogueRootItem = new DatasourceDataCatalogueBuilder(
          dataSourceApi,
          dataCatalogueContext,
          dataSourceApi.getDataCatalogueCategories(dataCatalogueContext)
        );
        setDataCatalogueRootItem(dataCatalogueRootItem);
      } else if (exploreUrl) {
        locationService.push(exploreUrl);
      }
    }
  }, [pendingExploreDisplay, dataSourceApi, exploreUrl, dataSource]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await onUpdate({ ...dataSource });

    onTest();
  };

  if (loadError) {
    return <DataSourceLoadError dataSourceRights={dataSourceRights} onDelete={onDelete} />;
  }

  if (loading) {
    return <PageLoader />;
  }

  // TODO - is this needed?
  if (!hasDataSource || !dsi) {
    return null;
  }

  if (pageId) {
    return (
      <DataSourcePluginContextProvider instanceSettings={dsi}>
        <DataSourcePluginConfigPage pageId={pageId} plugin={plugin} />;
      </DataSourcePluginContextProvider>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      {!hasWriteRights && <DataSourceMissingRightsMessage />}
      {readOnly && <DataSourceReadOnlyMessage />}
      {dataSourceMeta.state && <DataSourcePluginState state={dataSourceMeta.state} />}

      <CloudInfoBox dataSource={dataSource} />

      <BasicSettings
        dataSourceName={dataSource.name}
        isDefault={dataSource.isDefault}
        onDefaultChange={onDefaultChange}
        onNameChange={onNameChange}
        alertingSupported={alertingSupported}
      />

      {plugin && (
        <DataSourcePluginContextProvider instanceSettings={dsi}>
          <DataSourcePluginSettings
            plugin={plugin}
            dataSource={dataSource}
            dataSourceMeta={dataSourceMeta}
            onModelChange={onOptionsChange}
          />
        </DataSourcePluginContextProvider>
      )}

      <DataSourceTestingStatus testingStatus={testingStatus} />

      <ButtonRow
        onSubmit={onSubmit}
        onDelete={onDelete}
        onTest={onTest}
        onExplore={onExplore}
        canSave={!readOnly && hasWriteRights}
        canDelete={!readOnly && hasDeleteRights}
      />

      {dataCatalogueRootItem && (
        <DataCatalogue
          onClose={() => setDataCatalogueRootItem(undefined)}
          dataCatalogueRootItem={dataCatalogueRootItem}
        />
      )}
    </form>
  );
}
