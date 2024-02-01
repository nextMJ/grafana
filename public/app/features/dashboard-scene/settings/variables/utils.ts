import { chain, isEqual } from 'lodash';

import { DataSourceInstanceSettings, SelectableValue } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import {
  ConstantVariable,
  CustomVariable,
  DataSourceVariable,
  IntervalVariable,
  TextBoxVariable,
  QueryVariable,
  AdHocFilterSet,
  SceneVariable,
  MultiValueVariable,
  sceneUtils,
  SceneObject,
  SceneVariableState,
  SceneObjectState,
} from '@grafana/scenes';
import { VariableType } from '@grafana/schema';

import { getIntervalsQueryFromNewIntervalModel } from '../../utils/utils';

import { AdHocFiltersVariableEditor } from './editors/AdHocFiltersVariableEditor';
import { ConstantVariableEditor } from './editors/ConstantVariableEditor';
import { CustomVariableEditor } from './editors/CustomVariableEditor';
import { DataSourceVariableEditor } from './editors/DataSourceVariableEditor';
import { IntervalVariableEditor } from './editors/IntervalVariableEditor';
import { QueryVariableEditor } from './editors/QueryVariableEditor';
import { TextBoxVariableEditor } from './editors/TextBoxVariableEditor';

interface EditableVariableConfig {
  name: string;
  description: string;
  editor: React.ComponentType<any>;
}

export type EditableVariableType = Exclude<VariableType, 'system'>;

export function isEditableVariableType(type: VariableType): type is EditableVariableType {
  return type !== 'system';
}

export const EDITABLE_VARIABLES: Record<EditableVariableType, EditableVariableConfig> = {
  custom: {
    name: 'Custom',
    description: 'Define variable values manually',
    editor: CustomVariableEditor,
  },
  query: {
    name: 'Query',
    description: 'Variable values are fetched from a datasource query',
    editor: QueryVariableEditor,
  },
  constant: {
    name: 'Constant',
    description: 'Define a hidden constant variable, useful for metric prefixes in dashboards you want to share',
    editor: ConstantVariableEditor,
  },
  interval: {
    name: 'Interval',
    description: 'Define a timespan interval (ex 1m, 1h, 1d)',
    editor: IntervalVariableEditor,
  },
  datasource: {
    name: 'Data source',
    description: 'Enables you to dynamically switch the data source for multiple panels',
    editor: DataSourceVariableEditor,
  },
  adhoc: {
    name: 'Ad hoc filters',
    description: 'Add key/value filters on the fly',
    editor: AdHocFiltersVariableEditor,
  },
  textbox: {
    name: 'Textbox',
    description: 'Define a textbox variable, where users can enter any arbitrary string',
    editor: TextBoxVariableEditor,
  },
};

export const EDITABLE_VARIABLES_SELECT_ORDER: EditableVariableType[] = [
  'query',
  'custom',
  'textbox',
  'constant',
  'datasource',
  'interval',
  'adhoc',
];

export function getVariableTypeSelectOptions(): Array<SelectableValue<EditableVariableType>> {
  return EDITABLE_VARIABLES_SELECT_ORDER.map((variableType) => ({
    label: EDITABLE_VARIABLES[variableType].name,
    value: variableType,
    description: EDITABLE_VARIABLES[variableType].description,
  }));
}

export function getVariableEditor(type: EditableVariableType) {
  return EDITABLE_VARIABLES[type].editor;
}

interface CommonVariableProperties {
  name: string;
  label?: string;
}

export function getVariableScene(type: EditableVariableType, initialState: CommonVariableProperties) {
  switch (type) {
    case 'custom':
      return new CustomVariable(initialState);
    case 'query':
      return new QueryVariable(initialState);
    case 'constant':
      return new ConstantVariable(initialState);
    case 'interval':
      return new IntervalVariable(initialState);
    case 'datasource':
      return new DataSourceVariable(initialState);
    case 'adhoc':
      // TODO: Initialize properly AdHocFilterSet with initialState
      return new AdHocFilterSet({ name: initialState.name });
    case 'textbox':
      return new TextBoxVariable(initialState);
  }
}

export function hasVariableOptions(variable: SceneVariable): variable is MultiValueVariable {
  // variable options can be defined by state.options or state.intervals in case of interval variable
  return 'options' in variable.state || 'intervals' in variable.state;
}

export function getDefinition(model: SceneVariable): string {
  let definition = '';

  if (model instanceof QueryVariable) {
    definition = model.state.definition || (typeof model.state.query === 'string' ? model.state.query : '');
  } else if (model instanceof DataSourceVariable) {
    definition = String(model.state.pluginId);
  } else if (model instanceof CustomVariable) {
    definition = model.state.query;
  } else if (model instanceof IntervalVariable) {
    definition = getIntervalsQueryFromNewIntervalModel(model.state.intervals);
  } else if (model instanceof TextBoxVariable || model instanceof ConstantVariable) {
    definition = String(model.state.value);
  }

  return definition;
}

export function getOptionDataSourceTypes() {
  const datasources = getDataSourceSrv().getList({ metrics: true, variables: true });

  const optionTypes = chain(datasources)
    .uniqBy('meta.id')
    .map((ds: DataSourceInstanceSettings) => {
      return { label: ds.meta.name, value: ds.meta.id };
    })
    .value();

  optionTypes.unshift({ label: '', value: '' });

  return optionTypes;
}

function isSceneVariable(sceneObject: SceneObject): sceneObject is SceneVariable {
  return 'type' in sceneObject.state && 'getValue' in sceneObject;
}

function isVariableStateWithOptions(state: Partial<SceneVariableState>) {
  return 'options' in state || 'intervals' in state;
}

export function isSceneVariableInstance(sceneObject: SceneObject): sceneObject is SceneVariable {
  if (!isSceneVariable(sceneObject)) {
    return false;
  }

  return (
    sceneUtils.isAdHocVariable(sceneObject) ||
    sceneUtils.isConstantVariable(sceneObject) ||
    sceneUtils.isCustomVariable(sceneObject) ||
    sceneUtils.isDataSourceVariable(sceneObject) ||
    sceneUtils.isIntervalVariable(sceneObject) ||
    sceneUtils.isQueryVariable(sceneObject) ||
    sceneUtils.isTextBoxVariable(sceneObject)
  );
}

export function hasVariableChanged(
  changedObject: SceneObject,
  partialUpdate: Partial<SceneVariableState>,
  previousState: SceneObjectState,
  newState: SceneObjectState
) {
  if (!isSceneVariableInstance(changedObject)) {
    return false;
  }

  // changes like loading, options, value, text should not trigger a change in Dashboard Settings
  // options are part of variables that have options
  if (changedObject.state.loading === true) {
    return false;
  }
  if (isVariableStateWithOptions(partialUpdate)) {
    //FIXME:ts complains 'options' does not exist on type 'Partial<SceneVariableState>
    //@ts-ignore
    if (partialUpdate.options !== undefined || partialUpdate.text !== undefined || partialUpdate.value !== undefined) {
      return false;
    }
  }

  //TODO: Add support when variable is restore to original templating state (reset)

  return true;
}
