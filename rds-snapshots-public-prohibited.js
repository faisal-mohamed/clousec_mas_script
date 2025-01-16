require('dotenv').config();

const {
  RDSClient,
  CreateDBInstanceCommand,
  CreateDBSnapshotCommand,
  ModifyDBSnapshotCommand,
  DeleteDBSnapshotCommand,
  DeleteDBInstanceCommand,
  DescribeDBInstancesCommand,
  waitUntilDBInstanceAvailable,
  waitUntilDBSnapshotAvailable,
  waitUntilDBInstanceDeleted
} = require("@aws-sdk/client-rds");

// Configure AWS credentials using dotenv
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN
};

// Use region from .env file
const region = process.env.AWS_REGION;
const rdsClient = new RDSClient({ credentials, region });

// Configuration for minimal RDS instance
const dbInstanceIdentifier = `temp-db-instance-${Date.now()}`; // Make identifier unique
const dbSnapshotIdentifier = `public-snapshot-test-${Date.now()}`; // Make identifier unique

async function createMinimalRDSInstance() {
  const params = {
    DBInstanceIdentifier: dbInstanceIdentifier,
    Engine: "mysql",
    DBInstanceClass: "db.t3.micro",
    AllocatedStorage: 20,
    MasterUsername: "admin",
    MasterUserPassword: "tempPassword123!",
    PubliclyAccessible: false,
    BackupRetentionPeriod: 1,
    AvailabilityZone: `${region}a`, // Use the region from .env
  };

  try {
    console.log(`Creating DB instance in region ${region}...`);
    await rdsClient.send(new CreateDBInstanceCommand(params));
    console.log("Waiting for DB instance to be available...");
    await waitUntilDBInstanceAvailable(
      { client: rdsClient, maxWaitTime: 900 },
      { DBInstanceIdentifier: dbInstanceIdentifier }
    );
    console.log("DB instance created successfully");
  } catch (error) {
    console.error("Error creating DB instance:", error);
    throw error;
  }
}

async function createAndModifySnapshot() {
  try {
    console.log("Creating DB snapshot...");
    await rdsClient.send(new CreateDBSnapshotCommand({
      DBInstanceIdentifier: dbInstanceIdentifier,
      DBSnapshotIdentifier: dbSnapshotIdentifier,
    }));

    console.log("Waiting for DB snapshot to be available...");
    await waitUntilDBSnapshotAvailable(
      { client: rdsClient, maxWaitTime: 900 },
      { DBSnapshotIdentifier: dbSnapshotIdentifier }
    );

    console.log("Making snapshot public (non-compliant with CIS benchmark)...");
    await rdsClient.send(new ModifyDBSnapshotCommand({
      DBSnapshotIdentifier: dbSnapshotIdentifier,
      AttributeName: "restore",
      ValuesToAdd: ["all"]
    }));

    console.log("Snapshot made public successfully");
  } catch (error) {
    console.error("Error in snapshot operations:", error);
    throw error;
  }
}

async function cleanup() {
  try {
    console.log("Starting cleanup process...");
    
    // Delete the snapshot
    try {
      console.log("Deleting snapshot...");
      await rdsClient.send(new DeleteDBSnapshotCommand({
        DBSnapshotIdentifier: dbSnapshotIdentifier
      }));
      console.log("Snapshot deleted successfully");
    } catch (snapshotError) {
      console.error("Error deleting snapshot:", snapshotError);
    }

    // Delete the DB instance
    try {
      console.log("Deleting DB instance...");
      await rdsClient.send(new DeleteDBInstanceCommand({
        DBInstanceIdentifier: dbInstanceIdentifier,
        SkipFinalSnapshot: true,
        DeleteAutomatedBackups: true
      }));

      console.log("Waiting for DB instance to be deleted...");
      await waitUntilDBInstanceDeleted(
        { client: rdsClient, maxWaitTime: 900 },
        { DBInstanceIdentifier: dbInstanceIdentifier }
      );
      console.log("DB instance deleted successfully");
    } catch (instanceError) {
      console.error("Error deleting DB instance:", instanceError);
    }

    console.log("Cleanup completed");
  } catch (error) {
    console.error("Error during cleanup:", error);
    throw error;
  }
}

async function checkDBInstanceExists() {
  try {
    await rdsClient.send(new DescribeDBInstancesCommand({
      DBInstanceIdentifier: dbInstanceIdentifier
    }));
    return true;
  } catch (error) {
    if (error.name === 'DBInstanceNotFoundFault') {
      return false;
    }
    throw error;
  }
}

async function main() {
  console.log(`Starting RDS public snapshot simulation in region ${region}`);
  
  try {
    const exists = await checkDBInstanceExists();
    if (!exists) {
      await createMinimalRDSInstance();
    }

    await createAndModifySnapshot();

    // Reduced wait time to 1 minute to minimize costs
    console.log("Waiting for 1 minute before cleanup...");
    await new Promise(resolve => setTimeout(resolve, 60000));

    await cleanup();
    console.log("Simulation completed successfully");
  } catch (error) {
    console.error("Script execution failed:", error);
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error("Cleanup after error failed:", cleanupError);
    }
  }
}

// Add error handling for missing environment variables
function validateEnvironmentVariables() {
  const requiredEnvVars = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_REGION'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

// Execute the script with environment validation
if (require.main === module) {
  try {
    validateEnvironmentVariables();
    main();
  } catch (error) {
    console.error("Initialization error:", error.message);
    process.exit(1);
  }
}

module.exports = {
  createMinimalRDSInstance,
  createAndModifySnapshot,
  cleanup,
  checkDBInstanceExists
};
