## GHSCI Policy

The **Global Healthy and Sustainable City Indicators (GHSCI) Policy** analysis and reporting tool has been developed to support stakeholders participating in the [1000 Cities Challenge](https://www.healthysustainablecities.org/1000cities/) of the [Global Observatory of Healthy and Sustainable Cities (GOHSC)](https://www.healthysustainablecities.org/).

## Overview

GHSCI Policy is a web application that enables city stakeholders to upload a completed policy checklist audit (Excel `.xlsx`), automatically score their city's policy indicators, and generate a downloadable PDF report. Reports can be produced in English and local languages to strengthen advocacy and equip policymakers with evidence-informed insights.

## Features

- **Policy checklist upload** — Upload a completed GOHSC policy indicator checklist (`.xlsx`) to trigger automated processing.
- **Automated scoring and PDF report generation** — The app processes uploaded checklists and produces a city-level PDF report.
- **Real-time status tracking** — Report processing status (UPLOADED → PROCESSING → COMPLETED / FAILED) is updated in real time via subscriptions and polling.
- **Report management** — View, regenerate, and delete your uploaded reports and associated files.
- **Example report** — Load a pre-built example (Las Palmas, 2023) to explore the tool without your own data.
- **Feedback** — Submit feedback via the in-app feedback widget; view submitted feedback in the feedback gallery.
- **Translation support** — Browser-native page translation is supported via a built-in help popover (Chrome/Edge, Firefox, Safari).
- **Authentication** — Secure sign-in and sign-out powered by Amazon Cognito.

## Getting Started

1. Visit the [GOHSC Policy Indicators wiki](https://github.com/healthysustainablecities/global-indicators/wiki/1.-Policy-Indicators) and download the policy checklist Excel audit tool.
2. Complete the checklist for your city or region of interest.
3. Sign in to the app and upload your completed `.xlsx` file.
4. The app will score your city's indicators and generate a PDF report.

You can also click **Load an example report** to see the tool in action using a pre-populated Las Palmas 2023 example.

## Development

This application is built with **React + TypeScript** and deployed on **AWS Amplify**, using:

- **Amazon Cognito** for user authentication
- **AWS AppSync** (GraphQL) for the API
- **Amazon DynamoDB** for report metadata storage
- **Amazon S3** for file storage (uploaded `.xlsx` files, generated PDFs, and report images)
- **AWS Lambda** (Python) for report processing

## Development Team

Developed at RMIT University's [Centre for Urban Research](https://cur.org.au/) by:

- **Dr Carl Higgs** — GOHSC Software Working Group co-lead
- **Dr Melanie Lowe** — GOHSC Co-Director

With support from the [RMIT Advanced Cloud Ecosystem (RACE) Hub](https://www.rmit.edu.au/partner/hubs/race) and the [Global Observatory of Healthy and Sustainable Cities](https://www.healthysustainablecities.org/).

The app has been designed as a complement to the open source Global Healthy and Sustainable City Indicators (GHSCI) software:

> Higgs C, Lowe M, Giles-Corti B, Boeing G, Delclòs-Alió X, Puig-Ribera A, Adlakha D, Liu S, Borello Vargas JC, Castillo-Riquelme M, Jafari A, Molina-García J, Heikinheimo V, Queralt A, Cerin E, Resendiz E, Singh D, Rodriguez S, Suel E, Domínguez-Mallafré M, Ye Y, Alderton A. Global Healthy and Sustainable City Indicators: Collaborative development of an open science toolkit for calculating and reporting on urban indicators internationally. Environment and Planning B: Urban Analytics and City Science. 2024;52(5):23998083241292102. doi:https://doi.org/10.1177/23998083241292102.

### Policy Checklist

The policy review checklist was developed by **Dr Melanie Lowe** and **Deepti Adlakha** as part of the [Lancet Global Health Series on Urban Design, Transport and Health (2022)](https://www.thelancet.com/series-do/urban-design-transport-and-health).

> Lowe M, Adlakha D, Sallis JF, Salvo D, Cerin E, Moudon AV, Higgs C, Hinckson E, Arundel J, Boeing G, Liu S, Mansour P, Gebel K, Puig-Ribera A, Mishra PB, Bozovic T, Carson J, Dygrýn J, Florindo AA, Ho TP, Hook H, Hunter RF, Lai P-C, Molina-García J, Nitvimol K, Oyeyemi AL, Ramos CDG, Resendiz E, Troelsen J, Witlox F, Giles-Corti B. City planning policies to support health and sustainability: an international comparison of policy indicators for 25 cities. The Lancet Global Health. 2022;10(6):e882-e894. en. https://doi.org/10.1016/S2214-109X(22)00069-9.

### PolicyBridge Research

The tool supports a parallel research project — [PolicyBridge](https://wun.ac.uk/wun/research/view/policybridge-policy-assessment-reporting-for-healthy-sustainable-cities/) — led by **Dr Natalia Cadavid Aguilar** and **Dr Eugen Resendiz-Bontrud** at the Center for the Future of Cities, Tecnológico de Monterrey, Mexico, exploring the use of large language models to assist in policy review for diverse global contexts.

## Deploying to AWS

The application has been designed for deployment using [AWS Amplify](https://docs.amplify.aws/react/start/quickstart/#deploy-a-fullstack-app-to-aws).

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT License. See the [LICENSE](LICENSE) file.