const { 
    ACMClient, 
    RequestCertificateCommand,
    DeleteCertificateCommand,
    DescribeCertificateCommand,
    ListCertificatesCommand,
    ImportCertificateCommand
} = require("@aws-sdk/client-acm");

const { 
    Route53Client,
    ChangeResourceRecordSetsCommand,
    ListHostedZonesCommand
} = require("@aws-sdk/client-route-53");

const forge = require('node-forge');
require('dotenv').config();

// Configuration
const CONFIG = {
    DOMAIN: process.env.DOMAIN_NAME, // e.g., "example.com"
    COMMON_NAME: process.env.DOMAIN_NAME,
    VALIDITY_DAYS: 10, // Short validity to trigger non-compliance
    ORGANIZATION: 'Test Organization',
    COUNTRY: 'US'
};

const createAwsClient = (ClientClass) => {
    return new ClientClass({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        }
    });
};

function generateSelfSignedCertificate() {
    // Generate key pair
    const keys = forge.pki.rsa.generateKeyPair(2048);

    // Create certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + CONFIG.VALIDITY_DAYS);

    const attrs = [{
        name: 'commonName',
        value: CONFIG.COMMON_NAME
    }, {
        name: 'countryName',
        value: CONFIG.COUNTRY
    }, {
        name: 'organizationName',
        value: CONFIG.ORGANIZATION
    }];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // Sign certificate
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // Convert to PEM format
    const certPem = forge.pki.certificateToPem(cert);
    const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
    const publicKeyPem = forge.pki.publicKeyToPem(keys.publicKey);

    return {
        certificate: certPem,
        privateKey: privateKeyPem,
        publicKey: publicKeyPem
    };
}

async function waitForCertificateValidation(acmClient, certificateArn) {
    console.log('Waiting for certificate validation...');
    
    while (true) {
        const response = await acmClient.send(new DescribeCertificateCommand({
            CertificateArn: certificateArn
        }));
        
        const status = response.Certificate.Status;
        if (status === 'ISSUED') break;
        if (status === 'FAILED') {
            throw new Error('Certificate validation failed');
        }
        
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

async function createNonCompliantCertificate() {
    const acmClient = createAwsClient(ACMClient);

    try {
        console.log('Generating self-signed certificate...');
        const certData = generateSelfSignedCertificate();

        // Import the certificate to ACM
        console.log('Importing certificate to ACM...');
        const importResponse = await acmClient.send(new ImportCertificateCommand({
            Certificate: Buffer.from(certData.certificate),
            PrivateKey: Buffer.from(certData.privateKey),
            CertificateChain: Buffer.from(certData.certificate)
        }));

        const certificateArn = importResponse.CertificateArn;
        console.log(`Certificate imported successfully. ARN: ${certificateArn}`);

        // Get certificate details
        const describeResponse = await acmClient.send(new DescribeCertificateCommand({
            CertificateArn: certificateArn
        }));

        console.log('\nNon-compliant state created:');
        console.log(`Certificate ARN: ${certificateArn}`);
        console.log(`Domain: ${CONFIG.DOMAIN}`);
        console.log(`Expiration Date: ${describeResponse.Certificate.NotAfter}`);
        console.log(`Days until expiration: ${CONFIG.VALIDITY_DAYS}`);

        return certificateArn;

    } catch (error) {
        console.error('Error creating non-compliant certificate:', error);
        throw error;
    }
}

async function cleanupResources(certificateArn) {
    if (!certificateArn) return;

    const acmClient = createAwsClient(ACMClient);
    console.log('\nCleaning up resources...');

    try {
        await acmClient.send(new DeleteCertificateCommand({
            CertificateArn: certificateArn
        }));
        console.log('Certificate deleted successfully');
    } catch (error) {
        console.error('Error cleaning up certificate:', error);
    }
}

async function main() {
    let certificateArn;
    try {
        console.log('Creating non-compliant state for acm-certificate-expiration-check...');
        certificateArn = await createNonCompliantCertificate();
        
        // Wait for AWS Config to evaluate
        console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
        await new Promise(resolve => setTimeout(resolve, 120000));

    } catch (error) {
        console.error('Error in main execution:', error);
    } finally {
        // Cleanup
        await cleanupResources(certificateArn);
    }
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    createNonCompliantState: main
};
