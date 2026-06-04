locals {
  prefix                = var.prefix
  app_service_name      = "${local.prefix}wa1"
  function_app_name     = "${local.prefix}af1"
  storage_account_name  = "${local.prefix}sa1"
  service_bus_name      = "${local.prefix}sb1"
  postgres_server_name  = "${local.prefix}pg1"
  cognitive_account_name = "${local.prefix}fr1"
}

resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_virtual_network" "main" {
  name                = "${local.prefix}-vnet1"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  address_space       = ["10.0.0.0/16"]
}

resource "azurerm_subnet" "webapp_integration" {
  name                 = "webapp-integration-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.1.0/24"]

  delegation {
    name = "webapp-delegation"

    service_delegation {
      name    = "Microsoft.Web/serverFarms"
      actions = ["Microsoft.Network/virtualNetworks/subnets/action"]
    }
  }
}

resource "azurerm_subnet" "function_integration" {
  name                 = "function-integration-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.4.0/24"] # Using unique CIDR block 

  delegation {
    name = "function-delegation"

    service_delegation {
      name    = "Microsoft.Web/serverFarms"
      actions = ["Microsoft.Network/virtualNetworks/subnets/action"]
    }
  }
}

resource "azurerm_subnet" "private_endpoints" {
  name                 = "private-endpoint-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.2.0/24"]
  private_endpoint_network_policies = "Disabled"
}

resource "azurerm_subnet" "postgres" {
  name                 = "postgres-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.3.0/24"]
  private_endpoint_network_policies = "Disabled"

  delegation {
    name = "postgres-delegation"

    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/action"]
    }
  }
}

resource "azurerm_storage_account" "storage" {
  name                         = local.storage_account_name
  resource_group_name          = azurerm_resource_group.main.name
  location                     = azurerm_resource_group.main.location
  account_tier                 = var.storage_account_tier
  account_replication_type     = var.storage_account_replication_type
  account_kind                 = "StorageV2"
  https_traffic_only_enabled   = true
  allow_nested_items_to_be_public = false
  
  # Fix 1: Enable network rules so Terraform can create the container locally
  public_network_access_enabled = true 

  network_rules {
    default_action = "Deny"
    bypass         = ["AzureServices"] # Fix 4: Allow Azure services (like Function Apps) to access storage
    ip_rules       = ["167.103.54.253"] # TODO: Replace with your actual public IP
  }
}

resource "azurerm_storage_container" "insurance_docs" {
  name                  = "insurance-docs"
  storage_account_id    = azurerm_storage_account.storage.id
  container_access_type = "private"
}

resource "azurerm_servicebus_namespace" "sb" {
  name                = local.service_bus_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = var.service_bus_sku
  public_network_access_enabled = true
}

resource "azurerm_servicebus_queue" "email_queue" {
  name         = var.email_queue_name
  namespace_id = azurerm_servicebus_namespace.sb.id
}

resource "azurerm_postgresql_flexible_server" "postgres" {
  name                          = local.postgres_server_name
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  administrator_login           = var.postgres_admin_username
  administrator_password        = var.postgres_admin_password
  version                       = "14"
  storage_mb                    = 32768
  public_network_access_enabled = false
  backup_retention_days         = 7

  # Fix 1: The upgraded 4.x SKU format (Tier_Size)
  sku_name                      = var.postgres_sku_name

  # Required when delegated_subnet_id is used
  delegated_subnet_id           = azurerm_subnet.postgres.id
  private_dns_zone_id           = azurerm_private_dns_zone.postgresql.id

  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgresql]

  lifecycle {
    ignore_changes = [
      zone,
      high_availability
    ]
  }
}

resource "azurerm_postgresql_flexible_server_database" "bankingdb" {
  name      = var.postgres_db_name
  server_id = azurerm_postgresql_flexible_server.postgres.id
}

resource "azurerm_cognitive_account" "form_recognizer" {
  name                = local.cognitive_account_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  kind                = "CognitiveServices"
  sku_name            = "S0"
  custom_subdomain_name = local.cognitive_account_name
  public_network_access_enabled = false
}

resource "azurerm_service_plan" "plan" {
  name                = "${local.prefix}plan1"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  
  # The critical schema changes for v4.x:
  os_type             = "Linux"
  sku_name            = var.app_service_plan_sku # e.g., "S1" instead of separate Standard/S1
}

resource "azurerm_linux_web_app" "app" {
  name                = local.app_service_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  service_plan_id     = azurerm_service_plan.plan.id
  virtual_network_subnet_id = azurerm_subnet.webapp_integration.id

  site_config {
    # Fix 2: Force outbound traffic through the VNet to reach private endpoints
    vnet_route_all_enabled = true
    application_stack {
      node_version = "22-lts"
    }
  }

  app_settings = {
    "WEBSITE_RUN_FROM_PACKAGE"   = "1"
    "STORAGE_ACCOUNT_NAME"       = azurerm_storage_account.storage.name
    "STORAGE_ACCOUNT_KEY"        = azurerm_storage_account.storage.primary_access_key
    "STORAGE_CONTAINER_NAME"     = azurerm_storage_container.insurance_docs.name
    "POSTGRES_CONNECTION_STRING" = "postgresql://${var.postgres_admin_username}:${var.postgres_admin_password}@${azurerm_postgresql_flexible_server.postgres.fqdn}:5432/${var.postgres_db_name}"
    "OCR_FUNCTION_URL"           = "https://${local.function_app_name}.azurewebsites.net/api/ocr"
    "FORM_RECOGNIZER_ENDPOINT"   = azurerm_cognitive_account.form_recognizer.endpoint
  }
}

resource "azurerm_linux_function_app" "function" {
  name                = local.function_app_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  service_plan_id     = azurerm_service_plan.plan.id
  virtual_network_subnet_id = azurerm_subnet.function_integration.id
  
  storage_account_name       = azurerm_storage_account.storage.name
  storage_account_access_key = azurerm_storage_account.storage.primary_access_key

  site_config {
    # Fix 2: Force outbound traffic through the VNet
    vnet_route_all_enabled = true
    application_stack {
      node_version = "22"
    }
  }

  app_settings = {
    "FUNCTIONS_WORKER_RUNTIME"      = "node"
    "AzureWebJobsStorage"           = azurerm_storage_account.storage.primary_connection_string
    "STORAGE_ACCOUNT_NAME"          = azurerm_storage_account.storage.name
    "STORAGE_ACCOUNT_KEY"           = azurerm_storage_account.storage.primary_access_key
    "STORAGE_CONTAINER_NAME"        = azurerm_storage_container.insurance_docs.name
    "SERVICE_BUS_CONNECTION_STRING" = azurerm_servicebus_namespace.sb.default_primary_connection_string
    "EMAIL_QUEUE_NAME"              = var.email_queue_name
    "FORM_RECOGNIZER_ENDPOINT"      = azurerm_cognitive_account.form_recognizer.endpoint
    "FORM_RECOGNIZER_API_KEY"       = azurerm_cognitive_account.form_recognizer.primary_access_key
    "POSTGRES_CONNECTION_STRING"    = "postgresql://${var.postgres_admin_username}:${var.postgres_admin_password}@${azurerm_postgresql_flexible_server.postgres.fqdn}:5432/${var.postgres_db_name}"
    "EMAIL_USER"                    = var.email_user
    "EMAIL_PASSWORD"                = var.email_password
  }
}

resource "azurerm_private_dns_zone" "blob" {
  name                = "privatelink.blob.core.windows.net"
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_private_dns_zone" "servicebus" {
  name                = "privatelink.servicebus.windows.net"
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_private_dns_zone" "postgresql" {
  name                = "${local.prefix}.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_private_dns_zone" "cognitiveservices" {
  name                = "privatelink.cognitiveservices.azure.com"
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_private_dns_zone" "webapp" {
  name                = "privatelink.azurewebsites.net"
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_private_endpoint" "storage" {
  name                = "storage-pe"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.private_endpoints.id

  private_service_connection {
    name                           = "storage-psc"
    private_connection_resource_id = azurerm_storage_account.storage.id
    subresource_names              = ["blob"]
    is_manual_connection           = false
  }
}

# resource "azurerm_private_endpoint" "servicebus" {
#   name                = "servicebus-pe"
#   location            = azurerm_resource_group.main.location
#   resource_group_name = azurerm_resource_group.main.name
#   subnet_id           = azurerm_subnet.private_endpoints.id

#   private_service_connection {
#     name                           = "servicebus-psc"
#     private_connection_resource_id = azurerm_servicebus_namespace.sb.id
#     subresource_names              = ["namespace"]
#     is_manual_connection           = false
#   }
# }

resource "azurerm_private_endpoint" "cognitive" {
  name                = "cognitive-pe"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.private_endpoints.id

  private_service_connection {
    name                           = "cognitive-psc"
    private_connection_resource_id = azurerm_cognitive_account.form_recognizer.id
    subresource_names              = ["account"]
    is_manual_connection           = false
  }
}

resource "azurerm_private_endpoint" "function" {
  name                = "function-pe"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.private_endpoints.id

  private_service_connection {
    name                           = "function-psc"
    private_connection_resource_id = azurerm_linux_function_app.function.id
    subresource_names              = ["sites"]
    is_manual_connection           = false
  }
}

resource "azurerm_private_dns_zone_virtual_network_link" "storage" {
  name                  = "storage-link"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.blob.name
  virtual_network_id    = azurerm_virtual_network.main.id
  registration_enabled  = false
}

resource "azurerm_private_dns_zone_virtual_network_link" "servicebus" {
  name                  = "servicebus-link"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.servicebus.name
  virtual_network_id    = azurerm_virtual_network.main.id
  registration_enabled  = false
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgresql" {
  name                  = "postgresql-link"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.postgresql.name
  virtual_network_id    = azurerm_virtual_network.main.id
  registration_enabled  = false
}

resource "azurerm_private_dns_zone_virtual_network_link" "cognitive" {
  name                  = "cognitive-link"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.cognitiveservices.name
  virtual_network_id    = azurerm_virtual_network.main.id
  registration_enabled  = false
}

resource "azurerm_private_dns_zone_virtual_network_link" "function" {
  name                  = "function-link"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.webapp.name
  virtual_network_id    = azurerm_virtual_network.main.id
  registration_enabled  = false
}
