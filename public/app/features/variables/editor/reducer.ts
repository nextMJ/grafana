import { DataSourceApi } from '@grafana/data';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { VariablePayload } from '../state/types';
import { VariableQueryEditorType } from '../types';

type VariableEditorExtension<ExtendedProps extends {} = {}> = { [P in keyof ExtendedProps]: ExtendedProps[P] };

export interface VariableEditorState<ExtendedProps extends {} = {}> {
  id: string;
  name: string;
  errors: Record<string, string>;
  isValid: boolean;
  extended: VariableEditorExtension<ExtendedProps> | null;
}

export interface QueryVariableEditorState {
  dataSource?: DataSourceApi | null;
  VariableQueryEditor?: VariableQueryEditorType;
}

export const initialVariableEditorState: VariableEditorState<QueryVariableEditorState> = {
  id: '',
  isValid: true,
  errors: {},
  name: '',
  extended: null,
};

const variableEditorReducerSlice = createSlice({
  name: 'templating/editor',
  initialState: initialVariableEditorState,
  reducers: {
    setIdInEditor: (state: VariableEditorState<QueryVariableEditorState>, action: PayloadAction<{ id: string }>) => {
      state.id = action.payload.id;
    },
    clearIdInEditor: (state: VariableEditorState<QueryVariableEditorState>, action: PayloadAction<undefined>) => {
      state.id = '';
    },
    variableEditorMounted: (
      state: VariableEditorState<QueryVariableEditorState>,
      action: PayloadAction<{ name: string }>
    ) => {
      state.name = action.payload.name;
    },
    variableEditorUnMounted: (
      state: VariableEditorState<QueryVariableEditorState>,
      action: PayloadAction<VariablePayload>
    ) => {
      return initialVariableEditorState;
    },
    changeVariableNameSucceeded: (
      state: VariableEditorState<QueryVariableEditorState>,
      action: PayloadAction<VariablePayload<{ newName: string }>>
    ) => {
      state.name = action.payload.data.newName;
      delete state.errors['name'];
      state.isValid = Object.keys(state.errors).length === 0;
    },
    changeVariableNameFailed: (
      state: VariableEditorState<QueryVariableEditorState>,
      action: PayloadAction<{ newName: string; errorText: string }>
    ) => {
      state.name = action.payload.newName;
      state.errors.name = action.payload.errorText;
      state.isValid = Object.keys(state.errors).length === 0;
    },
    addVariableEditorError: (
      state: VariableEditorState<QueryVariableEditorState>,
      action: PayloadAction<{ errorProp: string; errorText: any }>
    ) => {
      state.errors[action.payload.errorProp] = action.payload.errorText;
      state.isValid = Object.keys(state.errors).length === 0;
    },
    removeVariableEditorError: (
      state: VariableEditorState<QueryVariableEditorState>,
      action: PayloadAction<{ errorProp: string }>
    ) => {
      delete state.errors[action.payload.errorProp];
      state.isValid = Object.keys(state.errors).length === 0;
    },
    changeVariableEditorExtended: (
      state: VariableEditorState<QueryVariableEditorState>,
      action: PayloadAction<{ propName: string; propValue: any }>
    ) => {
      state.extended = {
        ...state.extended,
        [action.payload.propName]: action.payload.propValue,
      };
    },
    updateQueryVariableDatasource: (
      state: VariableEditorState<QueryVariableEditorState>,
      action: PayloadAction<{ datasource: DataSourceApi; queryEditor: VariableQueryEditorType; variable: unknown }>
    ) => {
      if (!state.extended) {
        state.extended = {};
      }

      state.extended.dataSource = action.payload.datasource;
      state.extended.VariableQueryEditor = action.payload.queryEditor;
    },
    cleanEditorState: () => initialVariableEditorState,
  },
});

export const variableEditorReducer = variableEditorReducerSlice.reducer;

export const {
  setIdInEditor,
  clearIdInEditor,
  changeVariableNameSucceeded,
  changeVariableNameFailed,
  variableEditorMounted,
  variableEditorUnMounted,
  changeVariableEditorExtended,
  addVariableEditorError,
  removeVariableEditorError,
  cleanEditorState,
  updateQueryVariableDatasource,
} = variableEditorReducerSlice.actions;
