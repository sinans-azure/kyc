output "app_service_default_hostname" {
  description = "The default hostname for the App Service web app."
  value       = azurerm_linux_web_app.app.default_hostname
}

output "function_app_default_hostname" {
  description = "The default hostname for the Function App."
  value       = azurerm_linux_function_app.function.default_hostname
}

output "storage_account_name" {
  description = "Azure Storage account name."
  value       = azurerm_storage_account.storage.name
}

output "service_bus_queue_name" {
  description = "Service Bus queue name."
  value       = azurerm_servicebus_queue.email_queue.name
}

output "postgresql_connection_string" {
  description = "PostgreSQL connection string for the banking database."
  value       = "postgresql://${var.postgres_admin_username}:${var.postgres_admin_password}@${azurerm_postgresql_flexible_server.postgres.fqdn}:5432/${var.postgres_db_name}"
  sensitive   = true
}
