const { 
  ACMClient, 
  RequestCertificateCommand,
  AddTagsToCertificateCommand
} = require("@aws-sdk/client-acm");

require('dotenv').config();

function getAWSCredentials() {
  const required = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'];
  const missing = required.filter(env => !process.env[env]);
  
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN // Optional
    }
  };
}

async function createSimpleCertificate() {
  const acmClient = new ACMClient(getAWSCredentials());
  const domainName = `example-${Date.now()}.com`;

  try {
    // Request certificate
    console.log("Requesting ACM certificate...");
    const response = await acmClient.send(
      new RequestCertificateCommand({
        DomainName: domainName,
        ValidationMethod: 'EMAIL',
        Tags: [
          {
            Key: 'simulation-mas',
            Value: 'true'
          }
        ]
      })
    );

    const certificateArn = response.CertificateArn;

    // Add additional tag
    await acmClient.send(
      new AddTagsToCertificateCommand({
        CertificateArn: certificateArn,
        Tags: [
          {
            Key: 'NoAutoRenewal',
            Value: 'true'
          }
        ]
      })
    );

    console.log("\nCertificate created successfully!");
    console.log(`Certificate ARN: ${certificateArn}`);
    console.log(`Domain Name: ${domainName}`);
    console.log("\nTags applied:");
    console.log("- simulation-mas: true");
    console.log("- NoAutoRenewal: true");

    return {
      certificateArn,
      domainName
    };

  } catch (error) {
    console.error("Error creating certificate:", error);
    throw error;
  }
}

// Run if this is the main module
if (require.main === module) {
  createSimpleCertificate()
    .then(() => console.log("Setup completed successfully"))
    .catch(error => {
      console.error("Failed to create certificate:", error);
      process.exit(1);
    });
}

module.exports = {
  createSimpleCertificate
};
