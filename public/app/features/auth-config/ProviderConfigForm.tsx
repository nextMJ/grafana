import React, { useState } from 'react';
import { useForm } from 'react-hook-form';

import { AppEvents } from '@grafana/data';
import { getAppEvents, getBackendSrv, isFetchError, locationService, reportInteraction } from '@grafana/runtime';
import { Box, Button, CollapsableSection, ConfirmModal, Field, LinkButton, Stack, Switch } from '@grafana/ui';

import { FormPrompt } from '../../core/components/FormPrompt/FormPrompt';
import { Page } from '../../core/components/Page/Page';

import { FieldRenderer } from './FieldRenderer';
import { fields, sectionFields } from './fields';
import { SSOProvider, SSOProviderDTO } from './types';
import { dataToDTO, dtoToData } from './utils/data';

const appEvents = getAppEvents();

interface ProviderConfigProps {
  config?: SSOProvider;
  isLoading?: boolean;
  provider: string;
}

export const ProviderConfigForm = ({ config, provider, isLoading }: ProviderConfigProps) => {
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    unregister,
    formState: { errors, dirtyFields, isSubmitted },
  } = useForm({ defaultValues: dataToDTO(config), mode: 'onSubmit', reValidateMode: 'onChange' });
  const [isSaving, setIsSaving] = useState(false);
  const providerFields = fields[provider];
  const [submitError, setSubmitError] = useState(false);
  const dataSubmitted = isSubmitted && !submitError;
  const sections = sectionFields[provider];
  const [resetConfig, setResetConfig] = useState(false);

  const onSubmit = async (data: SSOProviderDTO) => {
    setIsSaving(true);
    setSubmitError(false);
    const requestData = dtoToData(data, provider);
    try {
      await getBackendSrv().put(
        `/api/v1/sso-settings/${provider}`,
        {
          id: config?.id,
          provider: config?.provider,
          settings: { ...requestData },
        },
        {
          showErrorAlert: false,
        }
      );

      reportInteraction('grafana_authentication_ssosettings_updated', {
        provider,
        enabled: requestData.enabled,
      });

      appEvents.publish({
        type: AppEvents.alertSuccess.name,
        payload: ['Settings saved'],
      });
      reset(data);
      // Delay redirect so the form state can update
      setTimeout(() => {
        locationService.push(`/admin/authentication`);
      }, 300);
    } catch (error) {
      let message = '';
      if (isFetchError(error)) {
        message = error.data.message;
      } else if (error instanceof Error) {
        message = error.message;
      }
      appEvents.publish({
        type: AppEvents.alertError.name,
        payload: [message],
      });
      setSubmitError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const onResetConfig = async () => {
    try {
      await getBackendSrv().delete(`/api/v1/sso-settings/${provider}`, undefined, { showSuccessAlert: false });
      reportInteraction('grafana_authentication_ssosettings_removed', {
        provider,
      });

      appEvents.publish({
        type: AppEvents.alertSuccess.name,
        payload: ['Settings reset to defaults'],
      });
      setTimeout(() => {
        locationService.push(`/admin/authentication`);
      });
    } catch (error) {
      let message = '';
      if (isFetchError(error)) {
        message = error.data.message;
      } else if (error instanceof Error) {
        message = error.message;
      }
      appEvents.publish({
        type: AppEvents.alertError.name,
        payload: [message],
      });
    }
  };

  return (
    <Page.Contents isLoading={isLoading}>
      <form onSubmit={handleSubmit(onSubmit)} style={{ maxWidth: '600px' }}>
        <>
          <FormPrompt
            confirmRedirect={!!Object.keys(dirtyFields).length && !dataSubmitted}
            onDiscard={() => {
              reportInteraction('grafana_authentication_ssosettings_abandoned', {
                provider,
              });
              reset();
            }}
          />
          <Field label="Enabled">
            <Switch {...register('enabled')} id="enabled" label={'Enabled'} />
          </Field>
          {sections ? (
            <Stack gap={2} direction={'column'}>
              {sections
                .filter((section) => !section.hidden)
                .map((section, index) => {
                  return (
                    <CollapsableSection label={section.name} isOpen={index === 0} key={section.name}>
                      {section.fields
                        .filter((field) => (typeof field !== 'string' ? !field.hidden : true))
                        .map((field) => {
                          return (
                            <FieldRenderer
                              key={typeof field === 'string' ? field : field.name}
                              field={field}
                              control={control}
                              errors={errors}
                              setValue={setValue}
                              register={register}
                              watch={watch}
                              unregister={unregister}
                              provider={provider}
                              secretConfigured={!!config?.settings.clientSecret}
                            />
                          );
                        })}
                    </CollapsableSection>
                  );
                })}
            </Stack>
          ) : (
            <>
              {providerFields.map((field) => {
                return (
                  <FieldRenderer
                    key={field}
                    field={field}
                    control={control}
                    errors={errors}
                    setValue={setValue}
                    register={register}
                    watch={watch}
                    unregister={unregister}
                    provider={provider}
                    secretConfigured={!!config?.settings.clientSecret}
                  />
                );
              })}
            </>
          )}
          <Box display={'flex'} gap={2} marginTop={6}>
            <Field>
              <Button type={'submit'}>{isSaving ? 'Saving...' : 'Save'}</Button>
            </Field>
            <Field>
              <LinkButton href={'/admin/authentication'} variant={'secondary'}>
                Discard
              </LinkButton>
            </Field>
            <Field>
              <Button
                variant={'secondary'}
                onClick={(event) => {
                  setResetConfig(true);
                }}
              >
                Reset
              </Button>
            </Field>
          </Box>
        </>
      </form>
      {resetConfig && (
        <ConfirmModal
          isOpen
          icon="trash-alt"
          title="Reset"
          body={
            <Stack direction={'column'} gap={3}>
              <span>Are you sure you want to reset this configuration?</span>
              <small>
                After resetting these settings Grafana will use the provider configuration from the system (config
                file/environment variables) if any.
              </small>
            </Stack>
          }
          confirmText="Reset"
          onDismiss={() => setResetConfig(false)}
          onConfirm={async () => {
            await onResetConfig();
            setResetConfig(false);
          }}
        />
      )}
    </Page.Contents>
  );
};
