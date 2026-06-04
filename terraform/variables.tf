variable "location" {
  type    = string
  default = "Central India"
}

variable "prefix" {
  type    = string
  default = "sinan"
}

variable "resource_group_name" {
  type    = string
  default = "sinan-rg1"
}

variable "postgres_admin_username" {
  type    = string
  default = "sinanadmin"
}

variable "postgres_admin_password" {
  type        = string
  description = "PostgreSQL admin password"
  sensitive   = true
}

variable "postgres_db_name" {
  type    = string
  default = "bankingdb"
}

variable "app_service_plan_sku" {
  type    = string
  default = "B1"
}

variable "service_bus_sku" {
  type    = string
  default = "Standard"
}

variable "storage_account_tier" {
  type    = string
  default = "Standard"
}

variable "storage_account_replication_type" {
  type    = string
  default = "LRS"
}

variable "email_queue_name" {
  type    = string
  default = "insurance-email-queue"
}

# variable "form_recognizer_api_key" {
#   type      = string
#   sensitive = true
# }

variable "email_user" {
  type    = string
  default = "sinanlw95@gmail.com"
}

variable "email_password" {
  type      = string
  sensitive = true
}

variable "postgres_sku_name" {
  type    = string
  default = "B_Standard_B2s"
}
