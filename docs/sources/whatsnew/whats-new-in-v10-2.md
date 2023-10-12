---
description: Feature and improvement highlights for Grafana v10.2
keywords:
  - grafana
  - new
  - documentation
  - '10.2'
  - release notes
labels:
products:
  - cloud
  - enterprise
  - oss
title: What's new in Grafana v10.2
weight: -39
---

# What’s new in Grafana v10.2

Welcome to Grafana 10.2! Read on to learn about changes to ...

For even more detail about all the changes in this release, refer to the [changelog](https://github.com/grafana/grafana/blob/master/CHANGELOG.md). For the specific steps we recommend when you upgrade to v10.2, check out our [Upgrade Guide]({{< relref "../upgrade-guide/upgrade-v10.2/index.md" >}}).

<!-- Template below

> Add on-prem only features here. Features documented in the Cloud What's new will be copied from those release notes.

## Feature
<!-- Name of contributor -->
<!-- _[Generally available | Available in private/public preview | Experimental] in Grafana [Open Source, Enterprise]_
Description. Include an overview of the feature and problem it solves, and where to learn more (like a link to the docs).
{{% admonition type="note" %}}
You must use relative references when linking to docs within the Grafana repo. Please do not use absolute URLs. For more information about relrefs, refer to [Links and references](/docs/writers-toolkit/writing-guide/references/).
{{% /admonition %}}
-->
<!-- Add an image, GIF or video  as below

{{< figure src="/media/docs/grafana/dashboards/WidgetVizSplit.png" max-width="750px" caption="DESCRIPTIVE CAPTION" >}}

Learn how to upload images here: https://grafana.com/docs/writers-toolkit/write/image-guidelines/#where-to-store-media-assets
-->

## Calculate visualization min/max individually per field

<!-- Oscar Kilhed -->

_Generally available in Grafana_

When visualizing multiple fields with a wide spread of values, calculating the min/max value of the visualization based on all fields can hide useful details.
{{< figure src="/media/docs/grafana/panels-visualizations/globalminmax.png" caption="Stat panel visualization with min/max calculated from all fields" > }}
In this example in the stats panel, it's hard to get an idea of how the values of each series relates to the historical values of that series. The threshold of 10% is exceeded by the A-series even though the A-series is below 10% of its historical maximum.

Now, you can automatically calculate the min/max of each visualized field, based on the lowest and highest value of the individual field! This setting is available in the standard options in most visualizations.

{{< figure src="/media/docs/grafana/panels-visualizations/localminmax.png" caption="Stat panel visualization with min/max calculated per field" > }}
In this example, using the same data, with the min and max calculated for each individual field, we get a much better understanding of how the current value relates to the historical values. The A-series no longer exceeds the 10% threshold, it is in fact at a historical low!

This is not only useful in the stat panel. Gauge panel, bar gauge, status history, table cells formatted by thresholds, and gauge table cells all benefit from this addition!

## Configure refresh token handling separately for OAuth providers

<!-- Mihaly Gyongyosi -->

_Available in public preview in all editions of Grafana._

With Grafana v9.3, we introduced a feature toggle called `accessTokenExpirationCheck`. It improves the security of Grafana by checking the expiration of the access token and automatically refreshing the expired access token when the user is logged in using one of the OAuth providers.

With the current release, we introduce a new configuration option for each OAuth provider called `use_refresh_token` that allows you to configure whether the particular OAuth integration should use refresh tokens to automatically refresh access tokens when they expire. In addition, to further improve security and provide secure defaults, `use_refresh_token` is enabled by default for providers that support either refreshing tokens automatically or client-controlled fetching of refresh tokens. It's enabled by default for the following OAuth providers: `AzureAD`, `GitLab`, `Google`.

For more information on how to set up refresh token handling, please refer to [the documentation of the particular OAuth provider.]({{< relref "../setup-grafana/configure-security/configure-authentication/" >}}).

{{% admonition type="note" %}}
The `use_refresh_token` configuration must be used in conjunction with the `accessTokenExpirationCheck` feature toggle. If you disable the `accessTokenExpirationCheck` feature toggle, Grafana will not check the expiration of the access token and will not automatically refresh the expired access token, even if the `use_refresh_token` configuration is set to `true`.

The `accessTokenExpirationCheck` feature toggle will be removed in Grafana v10.3.
{{% /admonition %}}

## Alerting: Grafana OnCall integration

<!-- George Robinson -->

_Generally available in Grafana_

Use the Grafana Alerting -  Grafana OnCall integration to effortlessly connect alerts generated by Grafana Alerting with Grafana OnCall, where you can then route them according to defined escalation chains and schedules.

## Alerting: Insights (Cloud only)

<!-- George Robinson -->

_Generally available in Grafana_

Use Alerting insights to monitor your alerting data, discover key trends about your organization’s alert management performance, and find patterns in why things go wrong.


## Alerting: Edit file-provisioned and Terraform-provisioned alerting resources

<!-- George Robinson -->

_Generally available in Grafana_

Edit provisioned alerting resources using file provisioning or Terraform directly from within the Grafana UI.

Access this feature by enabling the `window.localStorage.setItem('grafana.featureToggles', 'alertingModifiedExport=true')` feature toggle.

## Alerting: Recovery thresholds for alerts

<!-- George Robinson -->

_Generally available in Grafana_

To reduce the noise of flapping alerts, you can set a recovery threshold different to the alert threshold.

Flapping alerts occur when a metric hovers around the alert threshold condition and may lead to frequent state changes, resulting in too many notifications being generated.