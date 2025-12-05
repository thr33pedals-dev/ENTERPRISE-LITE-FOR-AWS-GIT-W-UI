/**
 * AWS Account Factory Service
 * Auto-provisions customer AWS accounts via Control Tower Account Factory
 * 
 * Prerequisites:
 * - AWS Control Tower set up with Account Factory
 * - Service Catalog portfolio shared with management account
 * - Platform running in a trusted account (Shared Services or dedicated)
 */

import { 
  ServiceCatalogClient, 
  ProvisionProductCommand,
  DescribeProvisionedProductCommand,
  SearchProvisionedProductsCommand,
  TerminateProvisionedProductCommand
} from '@aws-sdk/client-service-catalog';
import {
  OrganizationsClient,
  DescribeAccountCommand,
  ListAccountsCommand
} from '@aws-sdk/client-organizations';
import {
  STSClient,
  AssumeRoleCommand,
  GetCallerIdentityCommand
} from '@aws-sdk/client-sts';
import { S3Client, CreateBucketCommand, PutBucketTaggingCommand, PutBucketVersioningCommand } from '@aws-sdk/client-s3';
import logger from '../utils/logger.js';

const REGION = process.env.AWS_REGION || 'ap-southeast-1';

// Account Factory configuration
const CONFIG = {
  // Control Tower Account Factory product ID (get from Service Catalog)
  accountFactoryProductId: process.env.ACCOUNT_FACTORY_PRODUCT_ID,
  // The OU to place new customer accounts
  customerOU: process.env.CUSTOMER_OU_ID || 'ou-xxxx-xxxxxxxx',
  // SSO configuration
  ssoUserEmail: process.env.SSO_ADMIN_EMAIL,
  ssoFirstName: process.env.SSO_ADMIN_FIRST_NAME || 'Platform',
  ssoLastName: process.env.SSO_ADMIN_LAST_NAME || 'Admin',
  // Role that platform assumes in customer accounts
  crossAccountRoleName: 'EnterpriseLitePlatformRole',
  // Bucket naming convention
  bucketPrefix: 'enterprise-lite'
};

// Initialize clients
const serviceCatalogClient = new ServiceCatalogClient({ region: REGION });
const organizationsClient = new OrganizationsClient({ region: 'us-east-1' }); // Orgs API is global
const stsClient = new STSClient({ region: REGION });

/**
 * Provision a new AWS account for a customer via Account Factory
 */
export async function provisionCustomerAccount(options) {
  const {
    tenantId,
    companyName,
    email, // Account root email (must be unique)
    adminEmail // SSO admin email
  } = options;

  if (!CONFIG.accountFactoryProductId) {
    throw new Error('ACCOUNT_FACTORY_PRODUCT_ID not configured');
  }

  // Generate unique account name and email
  const accountName = `${companyName.substring(0, 30)}-${tenantId}`.replace(/[^a-zA-Z0-9-]/g, '-');
  const accountEmail = email || `aws+${tenantId}@yourdomain.com`; // Must be unique per account

  logger.info('Provisioning customer account', { tenantId, accountName });

  try {
    // Provision via Service Catalog (Account Factory)
    const provisionResult = await serviceCatalogClient.send(new ProvisionProductCommand({
      ProductId: CONFIG.accountFactoryProductId,
      ProvisionedProductName: `customer-${tenantId}`,
      ProvisioningParameters: [
        { Key: 'AccountName', Value: accountName },
        { Key: 'AccountEmail', Value: accountEmail },
        { Key: 'ManagedOrganizationalUnit', Value: CONFIG.customerOU },
        { Key: 'SSOUserEmail', Value: adminEmail || CONFIG.ssoUserEmail },
        { Key: 'SSOUserFirstName', Value: CONFIG.ssoFirstName },
        { Key: 'SSOUserLastName', Value: CONFIG.ssoLastName }
      ],
      Tags: [
        { Key: 'tenant-id', Value: tenantId },
        { Key: 'company-name', Value: companyName },
        { Key: 'managed-by', Value: 'enterprise-lite-platform' }
      ]
    }));

    const provisionedProductId = provisionResult.RecordDetail?.ProvisionedProductId;
    
    logger.info('Account provisioning initiated', { 
      tenantId, 
      provisionedProductId,
      recordId: provisionResult.RecordDetail?.RecordId
    });

    return {
      success: true,
      provisionedProductId,
      recordId: provisionResult.RecordDetail?.RecordId,
      status: 'PROVISIONING',
      message: 'Account provisioning started. This typically takes 20-30 minutes.'
    };
  } catch (error) {
    logger.error('Failed to provision account', { tenantId, error: error.message });
    throw error;
  }
}

/**
 * Check the status of account provisioning
 */
export async function getProvisioningStatus(provisionedProductId) {
  try {
    const result = await serviceCatalogClient.send(new DescribeProvisionedProductCommand({
      Id: provisionedProductId
    }));

    const detail = result.ProvisionedProductDetail;
    
    return {
      id: detail.Id,
      name: detail.Name,
      status: detail.Status,
      statusMessage: detail.StatusMessage,
      createdTime: detail.CreatedTime,
      lastUpdatedTime: detail.LastRecordId ? detail.LastProvisioningRecordId : null
    };
  } catch (error) {
    logger.error('Failed to get provisioning status', { provisionedProductId, error: error.message });
    throw error;
  }
}

/**
 * Get AWS account ID from provisioned product
 */
export async function getAccountIdFromProduct(provisionedProductId) {
  const status = await getProvisioningStatus(provisionedProductId);
  
  if (status.status !== 'AVAILABLE') {
    return null;
  }

  // Search for the account by provisioned product name
  const searchResult = await serviceCatalogClient.send(new SearchProvisionedProductsCommand({
    Filters: {
      SearchQuery: [`id:${provisionedProductId}`]
    }
  }));

  const product = searchResult.ProvisionedProducts?.[0];
  if (!product?.PhysicalId) {
    return null;
  }

  // The PhysicalId contains the account ID
  return product.PhysicalId;
}

/**
 * List all customer accounts provisioned by the platform
 */
export async function listCustomerAccounts() {
  try {
    const result = await serviceCatalogClient.send(new SearchProvisionedProductsCommand({
      Filters: {
        SearchQuery: ['productId:' + CONFIG.accountFactoryProductId]
      }
    }));

    return (result.ProvisionedProducts || []).map(product => ({
      provisionedProductId: product.Id,
      name: product.Name,
      status: product.Status,
      accountId: product.PhysicalId,
      createdTime: product.CreatedTime
    }));
  } catch (error) {
    logger.error('Failed to list customer accounts', { error: error.message });
    throw error;
  }
}

/**
 * Get account details from AWS Organizations
 */
export async function getAccountDetails(accountId) {
  try {
    const result = await organizationsClient.send(new DescribeAccountCommand({
      AccountId: accountId
    }));

    return {
      id: result.Account.Id,
      name: result.Account.Name,
      email: result.Account.Email,
      status: result.Account.Status,
      joinedTimestamp: result.Account.JoinedTimestamp
    };
  } catch (error) {
    logger.error('Failed to get account details', { accountId, error: error.message });
    throw error;
  }
}

/**
 * Assume role in customer account to perform operations
 */
export async function assumeCustomerRole(accountId, sessionName = 'platform-session') {
  const roleArn = `arn:aws:iam::${accountId}:role/${CONFIG.crossAccountRoleName}`;

  try {
    const result = await stsClient.send(new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: sessionName,
      DurationSeconds: 3600 // 1 hour
    }));

    logger.debug('Assumed role in customer account', { accountId, roleArn });

    return {
      accessKeyId: result.Credentials.AccessKeyId,
      secretAccessKey: result.Credentials.SecretAccessKey,
      sessionToken: result.Credentials.SessionToken,
      expiration: result.Credentials.Expiration
    };
  } catch (error) {
    logger.error('Failed to assume customer role', { accountId, roleArn, error: error.message });
    throw error;
  }
}

/**
 * Get S3 client for customer account
 */
export async function getCustomerS3Client(accountId, tenantId) {
  const credentials = await assumeCustomerRole(accountId, `platform-${tenantId}`);

  return new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken
    }
  });
}

/**
 * Initialize customer account after provisioning
 * Creates the S3 bucket and any other required resources
 */
export async function initializeCustomerAccount(accountId, tenantId, companyName) {
  logger.info('Initializing customer account', { accountId, tenantId });

  try {
    // Get S3 client for customer account
    const s3Client = await getCustomerS3Client(accountId, tenantId);

    // Create the documents bucket
    const bucketName = `${CONFIG.bucketPrefix}-${tenantId}-documents`;
    
    await s3Client.send(new CreateBucketCommand({
      Bucket: bucketName,
      CreateBucketConfiguration: {
        LocationConstraint: REGION
      }
    }));

    // Enable versioning
    await s3Client.send(new PutBucketVersioningCommand({
      Bucket: bucketName,
      VersioningConfiguration: {
        Status: 'Enabled'
      }
    }));

    // Add tags for cost allocation
    await s3Client.send(new PutBucketTaggingCommand({
      Bucket: bucketName,
      Tagging: {
        TagSet: [
          { Key: 'tenant-id', Value: tenantId },
          { Key: 'company-name', Value: companyName },
          { Key: 'managed-by', Value: 'enterprise-lite-platform' },
          { Key: 'environment', Value: process.env.NODE_ENV || 'production' }
        ]
      }
    }));

    logger.info('Customer account initialized', { accountId, tenantId, bucketName });

    return {
      success: true,
      accountId,
      bucketName,
      region: REGION
    };
  } catch (error) {
    logger.error('Failed to initialize customer account', { accountId, tenantId, error: error.message });
    throw error;
  }
}

/**
 * Terminate/delete a customer account
 * WARNING: This is destructive and should be used carefully
 */
export async function terminateCustomerAccount(provisionedProductId, tenantId) {
  logger.warn('Terminating customer account', { provisionedProductId, tenantId });

  try {
    await serviceCatalogClient.send(new TerminateProvisionedProductCommand({
      ProvisionedProductId: provisionedProductId,
      TerminateToken: `terminate-${tenantId}-${Date.now()}`
    }));

    return {
      success: true,
      message: 'Account termination initiated'
    };
  } catch (error) {
    logger.error('Failed to terminate account', { provisionedProductId, error: error.message });
    throw error;
  }
}

/**
 * Get current platform account identity
 */
export async function getPlatformIdentity() {
  const result = await stsClient.send(new GetCallerIdentityCommand({}));
  return {
    accountId: result.Account,
    arn: result.Arn,
    userId: result.UserId
  };
}

export default {
  provisionCustomerAccount,
  getProvisioningStatus,
  getAccountIdFromProduct,
  listCustomerAccounts,
  getAccountDetails,
  assumeCustomerRole,
  getCustomerS3Client,
  initializeCustomerAccount,
  terminateCustomerAccount,
  getPlatformIdentity,
  CONFIG
};




