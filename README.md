# Sinan Banking Demo App

This repo contains a simple banking web app designed to demonstrate:

- Azure App Service hosting a frontend and backend API
- Azure Storage Blob for insurance document uploads
- Azure Function App for OCR using Form Recognizer
- Azure Service Bus for email notification delivery
- Azure PostgreSQL Flexible Server for application data
- Private endpoints and VNet integration for non-public resources

## Repository layout

- `app.js` — Express API server and static site host
- `public/` — simple banking UI with HTML, CSS, and JavaScript
- `functions/` — Azure Functions app with OCR and Service Bus email sender
- `db/init.sql` — PostgreSQL schema for users, accounts, transactions, and insurance requests
- `.env.example` — example environment variables for local development

## Resource names

- Resource group: `sinan-rg1`
- App Service: `sinanwa1`
- Function App: `sinanaf1`
- Storage Account: `sinansa1`
- Service Bus namespace: `sinansb1`
- Service Bus queue: `insurance-email-queue`
- PostgreSQL Flexible Server: `sinanpg1`
- Form Recognizer / Cognitive Services: `sinanfr1`
- VNet: `sinan-vnet1`

## Local setup

1. Install dependencies in the repo root:

```powershell
cd c:\Users\307468\Azure\banking
npm install
```

2. Install dependencies for Azure Functions:

```powershell
cd functions
npm install
```

3. Copy `.env.example` to `.env` and populate the values.

4. Start the local app:

```powershell
npm start
```

5. Open `http://localhost:8080`.

## Azure deployment notes

### App Service

- Deploy the root of this repo to `sinanwa1`.
- The web app uses `app.js` and serves the frontend from `public/`.
- Configure application settings from `.env.example` values.

### Functions

- Deploy the `functions/` folder to `sinanaf1`.
- Create a `FUNCTIONS_WORKER_RUNTIME` setting with value `node`.
- Add the function app settings from `functions/local.settings.json.example`.

### Storage

- Create a Storage Account named `sinansa1`.
- Create a private blob container named `insurance-docs`.
- Grant the Function App and App Service access via private endpoints or managed identity.

### Service Bus

- Create a Service Bus namespace named `sinansb1`.
- Create a queue named `insurance-email-queue`.
- Add the queue connection string to the Function App settings as `SERVICE_BUS_CONNECTION_STRING`.

### PostgreSQL

- Create PostgreSQL Flexible Server named `sinanpg1`.
- Use private endpoint / VNet integration.
- Create a database named `bankingdb`.
- Use `db/init.sql` to initialize schema.

### Email

- Gmail address: `sinanlw95@gmail.com`
- Use an app password or allow SMTP access from your account.
- Set `EMAIL_USER` and `EMAIL_PASSWORD` in the function app settings.

## Azure Portal deployment steps

1. Create resource group `sinan-rg1` in `eastus2`.
2. Create the VNet `sinan-vnet1` with subnets:
   - `app-integration-subnet` for App Service and Function App VNet integration
   - `private-endpoint-subnet` for private endpoints
   - `postgres-subnet` delegated to `Microsoft.DBforPostgreSQL/flexibleServers`
3. Create Storage Account `sinansa1`:
   - Kind: StorageV2, Performance: Standard, Replication: LRS
   - Enable secure transfer and disable public access
   - Disable public network access
   - Create container `insurance-docs`
4. Create Service Bus namespace `sinansb1` and queue `insurance-email-queue`:
   - SKU: Standard
   - Disable public network access
5. Create PostgreSQL Flexible Server `sinanpg1`:
   - Version: 14, SKU: Standard_B1ms
   - Storage: 32 GB
   - Private network access enabled
   - Use delegated subnet `postgres-subnet`
   - Create database `bankingdb`
6. Create Cognitive Services account `sinanfr1`:
   - Kind: CognitiveServices, SKU: S0
   - Disable public network access if using private endpoints
7. Create App Service plan `sinanplan1` (Linux, Node 18)
8. Create Web App `sinanwa1`:
   - Runtime stack: Node 18
   - Use `sinanplan1`
   - Configure application settings from `.env.example`
   - Set `OCR_FUNCTION_URL` to `https://sinanaf1.azurewebsites.net/api/ocr`
9. Create Function App `sinanaf1` (Linux, Node 18):
   - Use `sinanplan1`
   - Set `FUNCTIONS_WORKER_RUNTIME=node`
   - Add settings from `functions/local.settings.json.example`
   - Use the same Storage Account `sinansa1` for `AzureWebJobsStorage`
10. Create private endpoints for:
   - Storage account (`privatelink.blob.core.windows.net`)
   - Service Bus namespace (`privatelink.servicebus.windows.net`)
   - PostgreSQL Flexible Server (`privatelink.postgres.database.azure.com`)
   - Cognitive Services (`privatelink.cognitiveservices.azure.com`)
   - Function App (`privatelink.azurewebsites.net`)
11. Configure DNS for private endpoints:
   - Add private DNS zones for each service
   - Link private DNS zones to `sinan-vnet1`
12. Use the default App Service hostname `sinanwa1.azurewebsites.net` for public access.
13. Deploy the repo to `sinanwa1` and the `functions` folder to `sinanaf1`.

## Terraform deployment

1. Copy the Terraform example values:

```powershell
cd c:\Users\307468\Azure\banking\terraform
Copy-Item terraform.tfvars.example terraform.tfvars
```

2. Edit `terraform.tfvars` and populate:
   - `postgres_admin_password`
   - `form_recognizer_api_key`
   - `email_password`

3. Initialize Terraform:

```powershell
terraform init
```

4. Review the plan:

```powershell
terraform plan -var-file=terraform.tfvars
```

5. Apply the deployment:

```powershell
terraform apply -var-file=terraform.tfvars
```

6. After apply, update the Function App settings with the actual Form Recognizer and Gmail secrets if necessary.

## How the flow works

1. User visits `sinanwa1.azurewebsites.net`.
2. The banking UI calls the App Service backend.
3. Insurance document uploads are saved to Azure Blob Storage.
4. App Service submits an OCR request to the HTTP-triggered function.
5. Function App reads the blob, uses Form Recognizer, computes the premium, and queues an email request.
6. The Service Bus-triggered function sends an email notification via Gmail.

## Notes

- Only `sinanwa1` is publicly exposed.
- All storage, database, and Service Bus traffic should remain private behind Azure private endpoints.
- The code is intentionally simple and ready for Azure Portal deployment.
