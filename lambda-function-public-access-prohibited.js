// require('dotenv').config();
// const {
//   LambdaClient,
//   CreateFunctionCommand,
//   DeleteFunctionCommand,
//   AddPermissionCommand,
//   GetPolicyCommand,
//   RemovePermissionCommand,
//   ListFunctionsCommand
// } = require("@aws-sdk/client-lambda");

// const fs = require('fs');
// const path = require('path');

// // Initialize Lambda client
// const lambdaClient = new LambdaClient({
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//     sessionToken: process.env.AWS_SESSION_TOKEN
//   },
//   region: process.env.AWS_REGION || 'ap-southeast-1'
// });

// // Track created resources
// const createdResources = [];

// // Create ZIP file for Lambda function
// async function createZipFile() {
//   const functionCode = `
// exports.handler = async (event) => {
//     const response = {
//         statusCode: 200,
//         body: JSON.stringify('Hello from Lambda!'),
//     };
//     return response;
// };`;

//   // Create temporary directory
//   const tmpDir = path.join(__dirname, 'tmp');
//   if (!fs.existsSync(tmpDir)) {
//     fs.mkdirSync(tmpDir);
//   }

//   // Write function code
//   const functionPath = path.join(tmpDir, 'index.js');
//   fs.writeFileSync(functionPath, functionCode);

//   // Create ZIP file
//   const AdmZip = require('adm-zip');
//   const zip = new AdmZip();
//   zip.addLocalFile(functionPath);
//   const zipPath = path.join(tmpDir, 'function.zip');
//   zip.writeZip(zipPath);

//   // Read ZIP file
//   const zipBuffer = fs.readFileSync(zipPath);

//   // Cleanup
//   fs.unlinkSync(functionPath);
//   fs.unlinkSync(zipPath);
//   fs.rmdirSync(tmpDir);

//   return zipBuffer;
// }

// // Create non-compliant Lambda function (with public access)
// async function createNonCompliantFunction() {
//   try {
//     // Generate unique function name
//     const functionName = `test-function-${Date.now()}`;

//     // Create ZIP file
//     console.log('Creating function ZIP file...');
//     const zipBuffer = await createZipFile();

//     // Create function
//     console.log('Creating Lambda function...');
//     await lambdaClient.send(
//       new CreateFunctionCommand({
//         FunctionName: functionName,
//         Runtime: 'nodejs18.x',
//         Role: process.env.LAMBDA_ROLE_ARN, // IAM role ARN for Lambda
//         Handler: 'index.handler',
//         Code: {
//           ZipFile: zipBuffer
//         },
//         Description: 'Test function for public access check',
//         Timeout: 30,
//         MemorySize: 128,
//         Publish: true
//       })
//     );

//     createdResources.push({
//       type: 'FUNCTION',
//       name: functionName
//     });

//     console.log(`Created function: ${functionName}`);

//     // Add public access permission
//     console.log('Adding public access permission...');
//     await lambdaClient.send(
//       new AddPermissionCommand({
//         FunctionName: functionName,
//         StatementId: 'PublicAccess',
//         Action: 'lambda:InvokeFunction',
//         Principal: '*', // This makes it non-compliant
//         Effect: 'Allow'
//       })
//     );

//     console.log('Added public access permission');
//     return functionName;
//   } catch (error) {
//     console.error('Error creating function:', error);
//     throw error;
//   }
// }

// // Check function public access
// async function checkFunctionPublicAccess(functionName) {
//   try {
//     const response = await lambdaClient.send(
//       new GetPolicyCommand({
//         FunctionName: functionName
//       })
//     );

//     console.log('\nAnalyzing Function:', functionName);
//     console.log('Resource-based Policy:');
    
//     let isPublic = false;
//     let policy;

//     if (response.Policy) {
//       policy = JSON.parse(response.Policy);
//       console.log(JSON.stringify(policy, null, 2));

//       // Check for public access in policy statements
//       isPublic = policy.Statement.some(statement => {
//         const principal = statement.Principal;
//         return (
//             statement.Effect === 'Allow' &&
//             (principal === '*' || 
//              (typeof principal === 'object' &&
//               principal.AWS &&
//               (principal.AWS === '*' || 
//                (Array.isArray(principal.AWS) && principal.AWS.includes('*')) ||
//                (typeof principal.AWS === 'string' && principal.AWS === '*'))))
//           );
          
//       });
//     } else {
//       console.log('No resource-based policy attached');
//     }

//     console.log('\nAccess Analysis:');
//     console.log(`Public Access: ${isPublic ? 'Yes' : 'No'}`);
    
//     const isCompliant = !isPublic;
//     console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
//     if (!isCompliant) {
//       console.log('Reason: Function allows public access');
//     }

//     return isCompliant;
//   } catch (error) {
//     console.error('Error checking function:', error);
//     throw error;
//   }
// }

// // List and check all functions
// async function listFunctionsAndCheck() {
//   try {
//     const response = await lambdaClient.send(new ListFunctionsCommand({}));
    
//     console.log('\nChecking all Lambda functions in region:');
//     let totalFunctions = 0;
//     let compliantFunctions = 0;
//     let nonCompliantFunctions = 0;

//     for (const func of response.Functions) {
//       totalFunctions++;
//       console.log(`\nFunction: ${func.FunctionName}`);
//       console.log(`Runtime: ${func.Runtime}`);
//       console.log(`Last Modified: ${func.LastModified}`);
      
//       try {
//         const isCompliant = await checkFunctionPublicAccess(func.FunctionName);
//         if (isCompliant) {
//           compliantFunctions++;
//         } else {
//           nonCompliantFunctions++;
//         }
//       } catch (error) {
//         if (error.name === 'ResourceNotFoundException') {
//           console.log('No resource-based policy found');
//           compliantFunctions++;
//         } else {
//           console.error(`Error checking function ${func.FunctionName}:`, error);
//         }
//       }
//     }

//     // Print summary
//     console.log('\n=== Compliance Summary ===');
//     console.log(`Total Functions: ${totalFunctions}`);
//     console.log(`Compliant Functions: ${compliantFunctions}`);
//     console.log(`Non-Compliant Functions: ${nonCompliantFunctions}`);
//     if (totalFunctions > 0) {
//       console.log(`Compliance Rate: ${((compliantFunctions / totalFunctions) * 100).toFixed(2)}%`);
//     }
//   } catch (error) {
//     console.error('Error listing functions:', error);
//   }
// }

// // Cleanup resources
// async function cleanup() {
//   console.log('\nCleaning up resources...');

//   for (const resource of createdResources) {
//     if (resource.type === 'FUNCTION') {
//       try {
//         // Remove public access permission first
//         try {
//           await lambdaClient.send(
//             new RemovePermissionCommand({
//               FunctionName: resource.name,
//               StatementId: 'PublicAccess'
//             })
//           );
//           console.log(`Removed public access permission from function: ${resource.name}`);
//         } catch (error) {
//           if (error.name !== 'ResourceNotFoundException') {
//             console.error(`Error removing permission from function ${resource.name}:`, error);
//           }
//         }

//         // Delete function
//         await lambdaClient.send(
//           new DeleteFunctionCommand({
//             FunctionName: resource.name
//           })
//         );
//         console.log(`Deleted function: ${resource.name}`);
//       } catch (error) {
//         console.error(`Error deleting function ${resource.name}:`, error);
//       }
//     }
//   }
// }

// // Main execution
// async function main() {
//   try {
//     console.log('Starting Lambda function public access check...');
    
//     // Create non-compliant function
//     console.log('\nCreating non-compliant function...');
//     const functionName = await createNonCompliantFunction();
    
//     // Check function public access
//     await checkFunctionPublicAccess(functionName);
    
//     // List all functions and check them
//     await listFunctionsAndCheck();
    
//     // Wait before cleanup
//     console.log('\nWaiting before cleanup...');
//     await new Promise(resolve => setTimeout(resolve, 5000));
    
//   } catch (error) {
//     console.error('Error in main execution:', error);
//   } finally {
//     await cleanup();
//   }
// }

// // Execute if running directly
// if (require.main === module) {
//   main().catch(error => {
//     console.error('Unhandled error:', error);
//     process.exit(1);
//   });
// }


require('dotenv').config();
const {
  LambdaClient,
  CreateFunctionCommand,
  DeleteFunctionCommand,
  AddPermissionCommand,
  GetPolicyCommand,
  RemovePermissionCommand,
  ListFunctionsCommand
} = require("@aws-sdk/client-lambda");

const {
  IAMClient,
  CreateRoleCommand,
  DeleteRoleCommand,
  PutRolePolicyCommand,
  DeleteRolePolicyCommand,
  AttachRolePolicyCommand,
  DetachRolePolicyCommand
} = require("@aws-sdk/client-iam");

const fs = require('fs');
const path = require('path');

// Initialize clients
const lambdaClient = new LambdaClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

const iamClient = new IAMClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Track created resources
const createdResources = [];

// Create IAM role for Lambda
async function createLambdaRole() {
  try {
    const roleName = `lambda-test-role-${Date.now()}`;
    
    // Create role
    const createRoleResponse = await iamClient.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com'
            },
            Action: 'sts:AssumeRole'
          }]
        })
      })
    );

    createdResources.push({
      type: 'IAM_ROLE',
      name: roleName
    });

    // Attach basic Lambda execution policy
    await iamClient.send(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
      })
    );

    console.log(`Created IAM role: ${roleName}`);
    
    // Wait for role to be available
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    return createRoleResponse.Role.Arn;
  } catch (error) {
    console.error('Error creating IAM role:', error);
    throw error;
  }
}

// Create ZIP file for Lambda function
async function createZipFile() {
  const functionCode = `
exports.handler = async (event) => {
    const response = {
        statusCode: 200,
        body: JSON.stringify('Hello from Lambda!'),
    };
    return response;
};`;

  const tmpDir = path.join(__dirname, 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
  }

  const functionPath = path.join(tmpDir, 'index.js');
  fs.writeFileSync(functionPath, functionCode);

  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  zip.addLocalFile(functionPath);
  const zipPath = path.join(tmpDir, 'function.zip');
  zip.writeZip(zipPath);

  const zipBuffer = fs.readFileSync(zipPath);

  fs.unlinkSync(functionPath);
  fs.unlinkSync(zipPath);
  fs.rmdirSync(tmpDir);

  return zipBuffer;
}

// Create non-compliant Lambda function (with public access)
async function createNonCompliantFunction(roleArn) {
  try {
    const functionName = `test-function-${Date.now()}`;
    const zipBuffer = await createZipFile();

    // Create function
    await lambdaClient.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs18.x',
        Role: roleArn,
        Handler: 'index.handler',
        Code: {
          ZipFile: zipBuffer
        },
        Description: 'Test function for public access check',
        Timeout: 30,
        MemorySize: 128,
        Publish: true
      })
    );

    createdResources.push({
      type: 'FUNCTION',
      name: functionName
    });

    console.log(`Created function: ${functionName}`);

    // Add public access permission
    await lambdaClient.send(
      new AddPermissionCommand({
        FunctionName: functionName,
        StatementId: 'PublicAccess',
        Action: 'lambda:InvokeFunction',
        Principal: '*', // This makes it non-compliant
        Effect: 'Allow'
      })
    );

    console.log('Added public access permission');
    return functionName;
  } catch (error) {
    console.error('Error creating function:', error);
    throw error;
  }
}

// Check function public access
async function checkFunctionPublicAccess(functionName) {
  try {
    const response = await lambdaClient.send(
      new GetPolicyCommand({
        FunctionName: functionName
      })
    );

    console.log('\nAnalyzing Function:', functionName);
    
    let isPublic = false;
    let policy;

    if (response.Policy) {
      policy = JSON.parse(response.Policy);
      console.log('Resource-based Policy:', JSON.stringify(policy, null, 2));

      // Check for public access in policy statements
      isPublic = policy.Statement.some(statement => {
        const principal = statement.Principal;
        return (
          statement.Effect === 'Allow' &&
          (principal === '*' || 
           (typeof principal === 'object' &&
            principal.AWS &&
            (principal.AWS === '*' || 
             (Array.isArray(principal.AWS) && principal.AWS.includes('*')) ||
             (typeof principal.AWS === 'string' && principal.AWS === '*'))))
        );
        
      });
    } else {
      console.log('No resource-based policy attached');
    }

    const isCompliant = !isPublic;
    console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    if (!isCompliant) {
      console.log('Reason: Function allows public access');
    }

    return isCompliant;
  } catch (error) {
    console.error('Error checking function:', error);
    throw error;
  }
}

// List and check all functions
async function listFunctionsAndCheck() {
  try {
    const response = await lambdaClient.send(new ListFunctionsCommand({}));
    
    console.log('\nChecking all Lambda functions:');
    let totalFunctions = 0;
    let nonCompliantFunctions = 0;

    for (const func of response.Functions) {
      totalFunctions++;
      try {
        const isCompliant = await checkFunctionPublicAccess(func.FunctionName);
        if (!isCompliant) {
          nonCompliantFunctions++;
        }
      } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
          console.log(`No policy found for function: ${func.FunctionName}`);
        } else {
          console.error(`Error checking function ${func.FunctionName}:`, error);
        }
      }
    }

    console.log(`\nTotal functions: ${totalFunctions}`);
    console.log(`Non-compliant functions: ${nonCompliantFunctions}`);
  } catch (error) {
    console.error('Error listing functions:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  // Remove permissions and delete Lambda functions
  for (const resource of createdResources) {
    if (resource.type === 'FUNCTION') {
      try {
        // Remove public access permission
        try {
          await lambdaClient.send(
            new RemovePermissionCommand({
              FunctionName: resource.name,
              StatementId: 'PublicAccess'
            })
          );
          console.log(`Removed public access permission from function: ${resource.name}`);
        } catch (error) {
          if (error.name !== 'ResourceNotFoundException') {
            console.error(`Error removing permission from function ${resource.name}:`, error);
          }
        }

        // Delete function
        await lambdaClient.send(
          new DeleteFunctionCommand({
            FunctionName: resource.name
          })
        );
        console.log(`Deleted function: ${resource.name}`);
      } catch (error) {
        console.error(`Error deleting function ${resource.name}:`, error);
      }
    }
  }

  // Clean up IAM roles
  for (const resource of createdResources) {
    if (resource.type === 'IAM_ROLE') {
      try {
        // Detach managed policy
        await iamClient.send(
          new DetachRolePolicyCommand({
            RoleName: resource.name,
            PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
          })
        );

        // Delete role
        await iamClient.send(
          new DeleteRoleCommand({
            RoleName: resource.name
          })
        );
        console.log(`Deleted IAM role: ${resource.name}`);
      } catch (error) {
        console.error(`Error deleting IAM role ${resource.name}:`, error);
      }
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting Lambda function public access check...');
    
    // Create IAM role
    const roleArn = await createLambdaRole();
    
    // Create non-compliant function
    const functionName = await createNonCompliantFunction(roleArn);
    
    // Check function
    await checkFunctionPublicAccess(functionName);
    
    // List all functions
    await listFunctionsAndCheck();
    
  } catch (error) {
    console.error('Error in main execution:', error);
  } finally {
    await cleanup();
  }
}

// Execute if running directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
