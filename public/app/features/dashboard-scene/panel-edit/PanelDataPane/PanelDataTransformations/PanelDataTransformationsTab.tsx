import { css } from '@emotion/css';
import React from 'react';
import { DragDropContext, Droppable } from 'react-beautiful-dnd';

import { DataTransformerConfig, GrafanaTheme2, IconName, PanelData } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { SceneObjectBase, SceneComponentProps, SceneDataTransformer } from '@grafana/scenes';
import { Button, ButtonGroup, ConfirmModal, Container, CustomScrollbar, useStyles2 } from '@grafana/ui';
import { TransformationOperationRows } from 'app/features/dashboard/components/TransformationsEditor/TransformationOperationRows';

import { VizPanelManager } from '../../VizPanelManager';
import { PanelDataPaneTabState, PanelDataPaneTab } from '../types';

import { EmptyTransformationsMessage } from './EmptyTransformationsMessage';

interface PanelDataTransformationsTabState extends PanelDataPaneTabState {}

export class PanelDataTransformationsTab
  extends SceneObjectBase<PanelDataTransformationsTabState>
  implements PanelDataPaneTab
{
  static Component = PanelDataTransformationsTabRendered;
  tabId = 'transformations';
  icon: IconName = 'process';
  private _panelManager: VizPanelManager;

  getTabLabel() {
    return 'Transformations';
  }

  getItemsCount() {
    return this.getDataTransformer().state.transformations.length;
  }

  constructor(panelManager: VizPanelManager) {
    super({});

    this._panelManager = panelManager;
  }

  public getDataTransformer(): SceneDataTransformer {
    const provider = this._panelManager.state.panel.state.$data;
    if (!provider || !(provider instanceof SceneDataTransformer)) {
      throw new Error('Could not find SceneDataTransformer for panel');
    }

    return provider;
  }

  public changeTransformations(transformations: DataTransformerConfig[]) {
    const dataProvider = this.getDataTransformer();
    if (dataProvider instanceof SceneDataTransformer) {
      dataProvider.setState({ transformations });
      dataProvider.reprocessTransformations();
    }
  }
}

interface TransformationEditorProps {
  transformations: DataTransformerConfig[];
  model: PanelDataTransformationsTab;
  data: PanelData;
}

function TransformationsEditor({ transformations, model, data }: TransformationEditorProps) {
  const transformationEditorRows = transformations.map((t, i) => ({ id: `${i} - ${t.id}`, transformation: t }));

  return (
    <DragDropContext onDragEnd={() => {}}>
      <Droppable droppableId="transformations-list" direction="vertical">
        {(provided) => {
          return (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              <TransformationOperationRows
                onChange={(index, transformation) => {
                  const newTransformations = transformations.slice();
                  newTransformations[index] = transformation;
                  model.changeTransformations(newTransformations);
                }}
                onRemove={(index) => {
                  const newTransformations = transformations.slice();
                  newTransformations.splice(index);
                  model.changeTransformations(newTransformations);
                }}
                configs={transformationEditorRows}
                data={data}
              ></TransformationOperationRows>
              {provided.placeholder}
            </div>
          );
        }}
      </Droppable>
    </DragDropContext>
  );
}

export function PanelDataTransformationsTabRendered({ model }: SceneComponentProps<PanelDataTransformationsTab>) {
  const styles = useStyles2(getStyles);
  const { data, transformations: transformsWrongType } = model.getDataTransformer().useState();
  const transformations: DataTransformerConfig[] = transformsWrongType as unknown as DataTransformerConfig[];

  return (
    <CustomScrollbar autoHeightMin="100%">
      <Container>
        {transformations.length < 1 ? (
          <EmptyTransformationsMessage onShowPicker={() => {}}></EmptyTransformationsMessage>
        ) : (
          <>
            <TransformationsEditor data={data!} transformations={transformations} model={model} />
            <ButtonGroup>
              <Button
                icon="plus"
                variant="secondary"
                onClick={() => {}}
                data-testid={selectors.components.Transforms.addTransformationButton}
              >
                Add another transformation
              </Button>
              <Button className={styles.removeAll} icon="times" variant="secondary" onClick={() => {}}>
                Delete all transformations
              </Button>
            </ButtonGroup>
            <ConfirmModal
              isOpen={false}
              title="Delete all transformations?"
              body="By deleting all transformations, you will go back to the main selection screen."
              confirmText="Delete all"
              onConfirm={() => {}}
              onDismiss={() => {}}
            />
          </>
        )}
      </Container>
    </CustomScrollbar>
  );
}

function getStyles(theme: GrafanaTheme2) {
  return {
    removeAll: css`
      margin-left: ${theme.spacing(2)};
    `,
  };
}