import React from 'react';

import { AnnotationQuery, DataTopic, PageLayoutType, getDataSourceRef } from '@grafana/data';
import { getDataSourceSrv, locationService } from '@grafana/runtime';
import {
  SceneComponentProps,
  SceneDataLayerProvider,
  SceneDataLayers,
  SceneObjectBase,
  sceneGraph,
} from '@grafana/scenes';
import { Page } from 'app/core/components/Page/Page';

import { DashboardAnnotationsDataLayer } from '../scene/DashboardAnnotationsDataLayer';
import { DashboardScene } from '../scene/DashboardScene';
import { NavToolbarActions } from '../scene/NavToolbarActions';
import { dataLayersToAnnotations } from '../serialization/dataLayersToAnnotations';
import { getDashboardSceneFor } from '../utils/utils';

import { EditListViewSceneUrlSync } from './EditListViewSceneUrlSync';
import { AnnotationSettingsEdit, AnnotationSettingsList, newAnnotationName } from './annotations';
import { DashboardEditView, DashboardEditViewState, useDashboardEditPageNav } from './utils';

export interface AnnotationsEditViewState extends DashboardEditViewState {
  editIndex?: number | undefined;
}

export class AnnotationsEditView extends SceneObjectBase<AnnotationsEditViewState> implements DashboardEditView {
  static Component = AnnotationsSettingsView;

  public getUrlKey(): string {
    return 'annotations';
  }

  protected _urlSync = new EditListViewSceneUrlSync(this);

  private get _dashboard(): DashboardScene {
    return getDashboardSceneFor(this);
  }

  private get _dataLayers(): SceneDataLayerProvider[] {
    return sceneGraph.getDataLayers(this._dashboard);
  }

  public getSceneDataLayers(): SceneDataLayers | undefined {
    const data = sceneGraph.getData(this);

    if (!(data instanceof SceneDataLayers)) {
      return undefined;
    }

    return data;
  }

  public getAnnotationsLength(): number {
    return this._dataLayers.filter((layer) => layer.topic === DataTopic.Annotations).length;
  }

  public getDashboard(): DashboardScene {
    return this._dashboard;
  }

  public onNew = () => {
    const newAnnotationQuery: AnnotationQuery = {
      name: newAnnotationName,
      enable: true,
      datasource: getDataSourceRef(getDataSourceSrv().getInstanceSettings(null)!),
      iconColor: 'red',
    };

    const newAnnotation = new DashboardAnnotationsDataLayer({
      key: `annotations-${newAnnotationQuery.name}`,
      query: newAnnotationQuery,
      name: newAnnotationQuery.name,
      isEnabled: Boolean(newAnnotationQuery.enable),
      isHidden: Boolean(newAnnotationQuery.hide),
    });

    const data = this.getSceneDataLayers();

    if (data) {
      data.setState({
        layers: [...data.state.layers, newAnnotation],
      });

      this.setState({ editIndex: this.getAnnotationsLength() - 1 });
    }
  };

  public onEdit = (idx: number) => {
    this.setState({ editIndex: idx });
  };

  public onMove = (idx: number, direction: number) => {
    const data = this.getSceneDataLayers();

    if (data) {
      const layers = [...data.state.layers];
      const [layer] = layers.splice(idx, 1);
      layers.splice(idx + direction, 0, layer);

      data.setState({
        layers,
      });
    }
  };

  public onDelete = (idx: number) => {
    const data = this.getSceneDataLayers();

    if (data) {
      const layers = [...data.state.layers];
      layers.splice(idx, 1);

      data.setState({
        layers,
      });
    }
  };
}

function AnnotationsSettingsView({ model }: SceneComponentProps<AnnotationsEditView>) {
  const dashboard = model.getDashboard();
  const sceneDataLayers = model.getSceneDataLayers();
  const { navModel, pageNav } = useDashboardEditPageNav(dashboard, model.getUrlKey());
  const { editIndex } = model.useState();

  let annotations: AnnotationQuery[] = [];

  if (sceneDataLayers) {
    const { layers } = sceneDataLayers.useState();
    annotations = dataLayersToAnnotations(layers);
  }

  const isEditing = editIndex != null && editIndex < model.getAnnotationsLength();

  return (
    <Page navModel={navModel} pageNav={pageNav} layout={PageLayoutType.Standard}>
      <NavToolbarActions dashboard={dashboard} />
      {!isEditing && (
        <AnnotationSettingsList
          annotations={annotations}
          onNew={model.onNew}
          onEdit={model.onEdit}
          onDelete={model.onDelete}
          onMove={model.onMove}
        />
      )}
      {isEditing && <AnnotationSettingsEdit annotations={annotations} editIdx={editIndex!} />}
    </Page>
  );
}
