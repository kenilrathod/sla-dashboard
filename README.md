# sla-dashboard

## Architecture

I built the app using React with Vite for the frontend, AWS Lambda for serverless processing, Amazon S3 for file storage, and PostgreSQL for persistent data storage.

### Upload flow

1. The user selects a CSV file in the React upload screen.
2. The frontend calls the backend API to request a pre-signed S3 upload URL.
3. The backend validates the upload request and returns a pre-signed URL that is valid for 5 minutes.
4. The frontend uploads the CSV directly to the S3 bucket using that URL.
5. When the file is uploaded, S3 triggers an AWS Lambda function.
6. The Lambda function reads the CSV from S3, parses it, validates each row, cleans invalid values where possible, and transforms the data into the format required by the database.
7. Valid rows are saved to PostgreSQL. Duplicate rows are ignored, and invalid rows are tracked.
8. The frontend checks the upload status until processing is complete. It then shows the number of inserted rows, duplicate rows, invalid rows, and other upload details.

This approach keeps the upload API lightweight. The frontend uploads directly to S3 instead of sending the complete CSV through the backend server. The actual CSV processing happens in Lambda, which is stateless and runs only when a file is uploaded.

### Dashboard flow

The dashboard reads processed data from PostgreSQL through backend API endpoints.

The dashboard includes:

- Overall SLA percentage
- Service-wise SLA percentage
- Service-wise average latency
- Average latency across all services
- SLA grouping based on service availability
- Total successful and failed checks
- Upload and processing summary, including inserted, duplicate, and invalid rows
- A filterable logs table

The logs table can be filtered by:

- Single date or date range
- Service
- Monitoring agent
- HTTP status code

The dashboard uses the cleaned records stored in PostgreSQL, so users can view data even after the original upload and Lambda execution have finished.

## Why I chose this approach

- **React + Vite:** Quick to build, lightweight, and suitable for a single-page dashboard.
- **S3 pre-signed URL upload:** Files go directly from the browser to S3 without exposing AWS credentials or passing large files through the backend.
- **AWS Lambda:** The CSV processing function is stateless and runs only when a file is uploaded, which matches the assignment requirement.
- **PostgreSQL:** It is a good fit for structured health-check data because the dashboard needs date-range filters, service filters, aggregations, SLA calculations, and log queries.
- **S3 event trigger:** Processing starts automatically after the file upload is complete, without requiring the frontend to send the CSV contents again.
- **Duplicate protection:** Records use a unique combination of service ID, service Name, timestamp, agent and region to avoid inserting the same monitoring check more than once.

## Data findings and handling

The input CSV contains health-check records from multiple services, agents, regions, and timestamps. Before storing the data and calculating SLA values, I validate and normalize important fields. Invalid records are stored or reported separately in the upload summary, but they are excluded from SLA calculations because they cannot be trusted.

### 1. Latency can have different units

Latency values can be missing, invalid, or provided in different units.

Examples of possible values:

```text
250ms
0.25s
120
invalid
empty
```

Handling:

- Values ending in `ms` are treated as milliseconds.
- Values ending in `s` are converted to milliseconds by multiplying by `1000`.
- Numeric values without a unit are treated as milliseconds.
- Empty, non-numeric, or invalid latency values are marked as invalid.
- Invalid latency records are excluded from latency averages and SLA calculations.

For example:

```text
0.25s → 250ms
1.5s  → 1500ms
250ms → 250ms
```

### 2. Timestamp format can be inconsistent

The timestamp field can be in a normal ISO date format or in Unix epoch milliseconds.

Handling:

- ISO timestamps are converted to a standard UTC ISO format.
- Numeric timestamp values in milliseconds are converted to a valid date.
- All accepted timestamps are stored in the format:

```text
YYYY-MM-DDTHH:MM:SSZ
```

Example:

```text
1747140300000 → 2025-05-13T12:45:00Z
```

- Missing, empty, or invalid timestamps are marked as invalid.
- Records with invalid timestamps are excluded from SLA calculations because they cannot be reliably included in date-based reporting or filtering.

### 3. Latency must be a valid positive value

Latency is important because it represents the time taken for the network request to complete.

Handling:

- Latency must be a valid number greater than `0`.
- Empty values, negative values, zero values, and invalid values are marked as invalid.
- These records are not used when calculating average latency or SLA values.

For example:

```text
250ms  → valid
0ms    → invalid
-10ms  → invalid
empty  → invalid
abc    → invalid
```

I made this decision because a request processing time cannot realistically be negative, and an empty or invalid latency value cannot be used to calculate a reliable SLA result.

### 4. HTTP status code validation

The status code is used to decide whether a health check should be counted as successful or failed.

Handling:

- Status codes from `200` to `499`, inclusive, are treated as successful checks.
- Status codes from `500` to `599`, inclusive, are treated as failed checks.
- Any value outside these ranges is treated as invalid.

Examples:

```text
200 → success
201 → success
400 → success
404 → success
500 → failure
503 → failure
999 → invalid
```

My assumption is that `4xx` status codes are client-side errors. In these cases, the server received and processed the request, but the request may have contained invalid input, missing parameters, or an incorrect resource path. Therefore, I do not treat `4xx` responses as service availability failures.

Status codes in the `5xx` range represent server-side failures, so they are counted as failures in the SLA calculation.

Invalid status codes, such as `999`, missing values, or non-numeric values, are excluded from SLA calculations because they do not represent valid HTTP responses.

### 5. Duplicate monitoring records

The CSV can contain duplicate health-check records. If duplicates are not handled, they can affect total check counts, success rates, latency averages, and the final SLA percentage.

Handling:

A record is considered a duplicate when the following values are the same:

```text
service_id
service_name
timestamp
agent
region
```

When duplicates are found:

- The first valid record is kept.
- Additional matching records are skipped.
- Skipped duplicate rows are included in the upload-processing summary.

This ensures that the same monitoring event is counted only once and does not incorrectly increase or decrease the SLA score.

### 6. Invalid records and SLA calculation

Only accepted records with valid timestamps, valid status codes, and valid latency values are included in SLA calculations.

The SLA percentage is calculated using valid records only:

\[
\text{SLA Percentage} =
\frac{\text{Successful Valid Checks}}{\text{Total Valid Checks}}
\times 100
\]

This avoids using incomplete or malformed input data to calculate availability.

For example, if an upload contains:

```text
100 total rows
90 valid successful checks
5 valid failed checks
3 duplicate checks
2 invalid checks
```

then the SLA calculation uses only the 95 valid unique checks:

\[
\frac{90}{95} \times 100 = 94.74\%
\]

The 3 duplicate rows and 2 invalid rows are shown in the upload summary but are not included in the SLA result.

## Assumptions and decisions

### SLA calculation

I calculate availability SLA using only valid and unique records:

```text
SLA % = successful checks / total valid checks × 100
```

I use a `99.9%` SLA target because the assignment example mentions this threshold.

Services are grouped as:

```text
Meets SLA    → SLA is 99.9% or higher
Below SLA    → SLA is below 99.9%
No valid data → no valid records are available for the selected filters
```

### Meaning of success

I treat HTTP status codes as follows:

```text
200–499 → successful
500–599 → failed
Other values → invalid
```

I consider `4xx` responses successful for availability because the server received and responded to the request. These are generally client-side errors, while `5xx` responses represent server-side failures and are included as SLA failures.

### Date filtering

All timestamps are stored in UTC.

For date-range filtering:

```text
Start date → inclusive
End date   → exclusive 
```
(For a selected end date, the backend adds one day and queries with ts >= startDate AND ts < nextDay, so the user’s selected end date is included while avoiding overlap between adjacent date ranges.)

### Dashboard statistics

I selected the dashboard stats based on what an on-call engineer, support person, or billing reviewer would need to understand service health quickly:

- Overall SLA percentage
- Total valid checks
- Successful and failed checks
- Number of services meeting or missing the SLA target
- Average latency
- Service-wise SLA percentage
- Service-wise latency
- Upload processing summary

In addition to average latency, the dashboard shows percentile latency values:

```text
P50 latency → median response time
P95 latency → 95% of requests completed within this time
P99 latency → 99% of requests completed within this time
```

These percentile values help identify slow requests that may be hidden by average latency. For example, a service may have a good average latency while a small number of requests are much slower.

## Live URL

Frontend:

```text
http://sla-dashboard-frontend.s3-website-ap-southeast-2.amazonaws.com/
```

Backend API:

```text
http://csv-processor-backend-env-1.eba-fwj3utvk.ap-southeast-2.elasticbeanstalk.com/ 
```

## Run locally

The project can also run locally with the same general architecture:

```text
React frontend
→ Node.js backend API
→ LocalStack S3 emulator
→ LocalStack Lambda emulator
→ PostgreSQL database
```

For local AWS service emulation, I use **LocalStack** with Docker. LocalStack is an open-source AWS emulator that allows local testing of services such as S3, Lambda, IAM, and S3 event notifications without using a real AWS account. [aws.amazon](https://aws.amazon.com/lambda/pricing/?p=ft&c=wa&z=3)

### Prerequisites

Install the following before starting:

```text
Node.js 20 or later
npm
Docker Desktop
AWS CLI
PostgreSQL
LocalStack
```

The AWS CLI is used with a LocalStack endpoint instead of the real AWS endpoint.

## Start the frontend

Open a terminal and run:

```bash
cd frontend/sla-dashboard-frontend
npm install
npm run dev
```

The frontend starts at:

```text
http://localhost:5173
```

## Start the backend

Open another terminal:

```bash
cd backend
npm install
npm run dev
```

The backend starts at:

```text
http://localhost:4000
```

The backend uses port `4000` by default. This can be changed by adding a `PORT` value in the backend `.env` file.

Example backend `.env`:

```env
PORT=4000
BUCKET=csvfiles
HOST=localhost
PGPORT=5432
DATABASE=slamonitor
PASSWORD=root
USER=postgres
```

## Start LocalStack 

Start LocalStack with Docker:

LocalStack runs on:

```text
http://localhost:4566
```

The `4566` port is the LocalStack gateway endpoint used by the AWS CLI and local application configuration.

## Create the local S3 bucket

Create the bucket used for CSV uploads:

```bash
aws --endpoint-url=http://localhost:4566 \
  --region=us-east-1 \
  s3 mb s3://csvfiles
```

## Create the Lambda IAM role

Create a local IAM role for the CSV processing Lambda:

```bash
aws --endpoint-url=http://localhost:4566 \
  --region=us-east-1 \
  iam create-role \
  --role-name csv-processor-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Service": "lambda.amazonaws.com"
        },
        "Action": "sts:AssumeRole"
      }
    ]
  }'
```

## Package and deploy Lambda

Open another terminal:

```bash
cd lambda
npm install
```

Create a deployment ZIP containing the Lambda source code and dependencies:

```bash
zip -r csv-processor.zip .
```

Create the Lambda function:

```bash
aws --endpoint-url=http://localhost:4566 \
  --region=us-east-1 \
  lambda create-function \
  --function-name csv-processor \
  --runtime nodejs20.x \
  --handler index.handler \
  --role arn:aws:iam::000000000000:role/csv-processor-role \
  --zip-file fileb://csv-processor.zip
```

## Connect S3 to Lambda

Allow S3 to invoke the Lambda function:

```bash
aws --endpoint-url=http://localhost:4566 \
  --region=us-east-1 \
  lambda add-permission \
  --function-name csv-processor \
  --statement-id s3-invoke \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::csvfiles
```

`notification.json`: Already shared inside lambda folder


Configure the S3 event notification:

```bash
aws --endpoint-url=http://localhost:4566 \
  --region=us-east-1 \
  s3api put-bucket-notification-configuration \
  --bucket csvfiles \
  --notification-configuration file://notification.json
```

After this setup, uploading a CSV file under the `uploads/` prefix invokes the local Lambda function.

## Configure S3 CORS

The frontend uploads directly to S3 using a pre-signed URL. Add this CORS configuration so the frontend running on port `5173` can upload files:

```bash
aws --endpoint-url=http://localhost:4566 \
  --region=us-east-1 \
  s3api put-bucket-cors \
  --bucket csvfiles \
  --cors-configuration '{
    "CORSRules": [
      {
        "AllowedOrigins": [
          "http://localhost:5173"
        ],
        "AllowedMethods": [
          "PUT",
          "GET",
          "HEAD"
        ],
        "AllowedHeaders": [
          "*"
        ],
        "ExposeHeaders": [
          "ETag"
        ]
      }
    ]
  }'
```

## Configure PostgreSQL

Create a PostgreSQL database:

```sql
CREATE DATABASE slamonitor;
```

Connect to the database and enable UUID generation:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Create the `upload_runs` table first:

```sql
CREATE TABLE IF NOT EXISTS public.upload_runs
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    s3_key text NOT NULL,
    original_filename text,
    status text NOT NULL DEFAULT 'pending',
    total_rows integer DEFAULT 0,
    inserted_rows integer DEFAULT 0,
    duplicate_rows integer DEFAULT 0,
    conflicting_rows integer DEFAULT 0,
    rejected_rows integer DEFAULT 0,
    rejected_reasons jsonb DEFAULT '{}'::jsonb,
    min_ts timestamp with time zone,
    max_ts timestamp with time zone,
    error_message text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT upload_runs_pkey PRIMARY KEY (id),

    CONSTRAINT upload_runs_status_check
        CHECK (
            status = ANY (
                ARRAY[
                    'pending',
                    'processing',
                    'completed',
                    'failed'
                ]
            )
        )
);
```

Then create the `checks` table:

```sql
CREATE TABLE IF NOT EXISTS public.checks
(
    id bigserial NOT NULL,
    service_id text NOT NULL,
    service_name text NOT NULL,
    ts text NOT NULL,
    status_code_raw text NOT NULL,
    status_code integer,
    is_valid_http_status boolean NOT NULL,
    is_success boolean NOT NULL,
    latency_ms numeric,
    latency_missing boolean NOT NULL DEFAULT false,
    latency_invalid boolean NOT NULL DEFAULT false,
    agent text NOT NULL,
    region text NOT NULL,
    source_row_number integer,
    upload_run_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT checks_pkey PRIMARY KEY (id),

    CONSTRAINT uq_check
        UNIQUE (service_id, ts, agent),

    CONSTRAINT checks_upload_run_id_fkey
        FOREIGN KEY (upload_run_id)
        REFERENCES public.upload_runs (id)
        ON UPDATE NO ACTION
        ON DELETE SET NULL
);
```

## Local flow

After the services are running:

1. Open the frontend:

```text
http://localhost:5173
```

2. Upload a CSV file.
3. The backend creates a local pre-signed S3 URL.
4. The browser uploads the file to LocalStack S3.
5. LocalStack S3 triggers the local Lambda function.
6. The Lambda validates and stores records in the local PostgreSQL database.
7. The frontend polls the backend for upload status.
8. Once processing is complete, the dashboard loads the SLA data and logs from PostgreSQL.

This local setup is intended for development and testing. The deployed version uses real AWS S3, AWS Lambda, PostgreSQL RDS, Elastic Beanstalk, and S3 static website hosting.

## What I would do differently with more time

### 1. Support multiple companies or tenants

The current implementation assumes that all uploaded monitoring data belongs to one company or one set of services.

With more time, I would add a company or tenant identifier to the data model. For example:

```text
company_id
company_name
service_id
upload_run_id
```

This would allow different companies or teams to upload and view only their own monitoring data, SLA reports, logs, and upload history.

A production version would also include authentication and authorization so that users can access only the company or team they belong to.

### 2. Make SLA rules configurable

The current SLA calculation is based mainly on availability:

```text
Successful checks / total valid checks × 100
```

However, real SLA contracts can include more conditions. For example, an SLA may consider a request unsuccessful when:

```text
HTTP status code is 5xx
Latency is greater than 6000ms
A request times out
A required region has no monitoring data
Too many checks are missing
```

With more time, I would add configurable SLA rules per service or per company. For example:

```text
Service: Payment API
Availability target: 99.9%
Maximum accepted latency: 6000ms
Warning latency: 2000ms
Required monitoring regions: ap-southeast-2, us-east-1
```

This would make the dashboard more realistic because different services can have different SLA targets and performance requirements.

### 3. Improve data validation and reporting

I would add a more detailed rejected-record report. Instead of only showing total invalid rows, users could download a CSV containing:

```text
source_row_number
original_row_data
rejection_reason
```

For example:

```text
Row 24 → invalid timestamp
Row 61 → latency is negative
Row 85 → unsupported status code
Row 102 → duplicate record
```

This would make it easier for users to correct the original source data and upload it again.

### 4. Add upload history and reprocessing

The current project shows processing results for uploads, but with more time I would add a dedicated upload-history page.

It would show:

- Original file name
- Upload date and time
- Processing status
- Total, inserted, duplicate, and rejected row counts
- Date range found in the file
- Error message, if processing failed
- Option to view invalid rows
- Option to reprocess an upload after fixing processing rules

This would improve traceability and make the data pipeline easier to audit.

### 6. Add an FAQ or AI assistant

I would add an optional read-only FAQ or chat assistant for dashboard users.

It could answer questions such as:

```text
Which service had the lowest SLA this week?
Why did the Payment API miss its SLA target?
How many invalid rows were found in the latest upload?
Which region had the highest average latency?
Show services with P95 latency above 2000ms.
```

A production version could use an LLM with retrieval-augmented generation (RAG). The assistant would retrieve relevant dashboard metrics, upload summaries, validation rules, and documentation before answering.

I would keep the assistant read-only at first. It should explain the monitoring data and SLA calculations, but it should not modify records, upload files, or change SLA rules without explicit user confirmation.

### 7. Improve dashboard usability

With more time, I would improve the dashboard with:

- SLA trend charts over time
- Latency trend charts
- Service comparison charts
- Region and agent comparison views
- Export filtered logs as CSV
- Saved filter selections
- A clearer mobile layout
- Better loading, empty, and error states

These changes would make the dashboard more useful for ongoing monitoring rather than only reviewing a single uploaded CSV.
