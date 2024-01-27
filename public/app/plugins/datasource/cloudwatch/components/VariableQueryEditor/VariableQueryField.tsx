import React from 'react';

import { SelectableValue } from '@grafana/data';
import { EditorField } from '@grafana/experimental';
import { Alert, InlineField, Select } from '@grafana/ui';

import { VariableQueryType } from '../../types';
import { removeMarginBottom } from '../styles';

const LABEL_WIDTH = 20;

interface VariableQueryFieldProps<T> {
  onChange: (value: T) => void;
  options: SelectableValue[];
  value: T | null;
  label: string;
  inputId?: string;
  allowCustomValue?: boolean;
  isLoading?: boolean;
  newFormStylingEnabled?: boolean;
  error?: string;
}

export const VariableQueryField = <T extends string | VariableQueryType>({
  label,
  onChange,
  value,
  options,
  allowCustomValue = false,
  isLoading = false,
  inputId = label,
  newFormStylingEnabled,
  error,
}: VariableQueryFieldProps<T>) => {
  return newFormStylingEnabled ? (
    <>
      <EditorField label={label} htmlFor={inputId} className={removeMarginBottom}>
        <Select
          aria-label={label}
          allowCustomValue={allowCustomValue}
          value={value}
          onChange={({ value }) => onChange(value!)}
          options={options}
          isLoading={isLoading}
          inputId={inputId}
        />
      </EditorField>
      {error && <Alert title={error} severity="error" topSpacing={1} />}
    </>
  ) : (
    <>
      <InlineField label={label} labelWidth={LABEL_WIDTH} htmlFor={inputId}>
        <Select
          aria-label={label}
          width={25}
          allowCustomValue={allowCustomValue}
          value={value}
          onChange={({ value }) => onChange(value!)}
          options={options}
          isLoading={isLoading}
          inputId={inputId}
        />
      </InlineField>
      {error && <Alert title={error} severity="error" topSpacing={1} />}
    </>
  );
};
