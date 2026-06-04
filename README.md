# KYC & Insurance Demo Application

This project is a web application that demonstrates a simple banking dashboard and an insurance request submission workflow. It's designed to showcase a modern, decoupled architecture using Node.js and various Azure services.

## Architecture Overview

The application is composed of a frontend, a backend API, and several serverless components running on Azure.

*   **Frontend**: A single-page application built with HTML, CSS (Tailwind CSS), and vanilla JavaScript. It provides the user interface for logging in, viewing account details, and submitting insurance requests.
*   **Backend API**: A Node.js application using the Express framework. It serves the frontend and provides API endpoints for user authentication, data retrieval, and file uploads.
*   **Database**: An Azure Database for PostgreSQL instance stores all user, account, transaction, and insurance request data.

### Azure Services

*   **Azure App Service**: Hosts the main Node.js backend application.
*   **Azure Blob Storage**: Securely stores documents uploaded by users for their insurance requests.
*   **Azure Functions**:
    *   An **OCR Function** is triggered after a document is uploaded. It uses Azure Form Recognizer to extract text and determine the applicant's age.
    *   An **Email Function** is triggered by a message on a Service Bus queue. It sends a confirmation email to the user with their calculated premium.
*   **Azure Form Recognizer**: A cognitive service that analyzes document content to extract key information (like age).
*   **Azure Service Bus**: A message queue used to decouple the OCR process from the email notification process, ensuring reliability.

## Features

*   **User Authentication**: A simple email and password login for a demo user.
*   **Banking Dashboard**: View mock bank accounts and recent transactions.
*   **Insurance Request Submission**: Users can fill out a form and upload an identity document (e.g., a driver's license).
*   **Asynchronous OCR Processing**: Document analysis happens in the background without blocking the UI. The user receives an immediate confirmation that their request was submitted.
*   **Automated Premium Calculation**: The OCR function extracts the user's age and calculates a corresponding insurance premium.
*   **Email Notifications**: Users receive an email with their premium details once processing is complete.

## Local Setup & Configuration

### Prerequisites

*   [Node.js](https://nodejs.org/) (LTS version recommended)
*   [Git](https://git-scm.com/)
*   An Azure Subscription to deploy the required services.

### Installation

1.  Clone the repository:
    ```sh
    git clone <your-repository-url>
    cd kyc
    ```

2.  Install the dependencies:
    ```sh
    npm install
    ```

3.  Create a `.env` file in the root of the `kyc` folder and add the following environment variables. These values will come from your deployed Azure resources.

    ```env
    # PostgreSQL
    POSTGRES_CONNECTION_STRING="postgres://user:password@hostname.postgres.database.azure.com:5432/database?sslmode=require"

    # Azure Storage
    STORAGE_ACCOUNT_NAME="yourstorageaccountname"
    STORAGE_ACCOUNT_KEY="yourstorageaccountkey"
    STORAGE_CONTAINER_NAME="insurance-docs"

    # Azure Function URL for OCR
    OCR_FUNCTION_URL="https://your-function-app.azurewebsites.net/api/ocr-function-name"

    # Server Port
    PORT=8080
    ```

### Running Locally

To start the application locally, run:

```sh
npm start
```

The application will be available at `http://localhost:8080`.

## Terraform Deployment

This project includes Terraform configuration to automate the provisioning of all required Azure infrastructure.

### Resources Created

The Terraform scripts will create the following resources:

*   Resource Group
*   Azure App Service Plan and App Service
*   Azure Database for PostgreSQL (Flexible Server)
*   Azure Storage Account (for Blob Storage)
*   Azure Function App (for OCR and Email functions)
*   Azure Service Bus (Namespace and Queue)
*   Azure Form Recognizer (Cognitive Services Account)
*   Application Insights (for monitoring)

### Deployment Steps

1.  Navigate to the `terraform` directory within the project.

2.  (Optional) Create a `terraform.tfvars` file to override default variable values, such as resource names or locations.

3.  Initialize Terraform:
    ```sh
    terraform init
    ```

4.  Review the execution plan:
    ```sh
    terraform plan
    ```

5.  Apply the configuration to create the Azure resources:
    ```sh
    terraform apply -auto-approve
    ```

After the deployment is complete, Terraform will output the necessary values (like connection strings and hostnames) that you need to update in your `.env` file or in the App Service application settings.