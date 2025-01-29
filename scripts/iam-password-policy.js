const {
    IAMClient,
    CreateUserCommand,
    CreateLoginProfileCommand,
    GetAccountPasswordPolicyCommand
  } = require("@aws-sdk/client-iam");

  require('dotenv').config();
  
  // Initialize IAM client
  const iamClient = new IAMClient({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION
  });
  
  async function getPasswordPolicy() {
    try {
      const response = await iamClient.send(new GetAccountPasswordPolicyCommand({}));
      console.log('\nCurrent Password Policy:');
      console.log('------------------------');
      console.log(`Minimum Length: ${response.PasswordPolicy.MinimumPasswordLength}`);
      console.log(`Require Symbols: ${response.PasswordPolicy.RequireSymbols}`);
      console.log(`Require Numbers: ${response.PasswordPolicy.RequireNumbers}`);
      console.log(`Require Uppercase: ${response.PasswordPolicy.RequireUppercaseCharacters}`);
      console.log(`Require Lowercase: ${response.PasswordPolicy.RequireLowercaseCharacters}`);
      console.log(`Allow Users to Change: ${response.PasswordPolicy.AllowUsersToChangePassword}`);
      console.log(`Max Password Age: ${response.PasswordPolicy.MaxPasswordAge || 'Not set'}`);
      console.log(`Password Reuse Prevention: ${response.PasswordPolicy.PasswordReusePrevention || 'Not set'}`);
      console.log('------------------------\n');
      return response.PasswordPolicy;
    } catch (error) {
      if (error.name === 'NoSuchEntityException') {
        console.log('No password policy is set for the account');
        return null;
      }
      console.error('Error getting password policy:', error);
      throw error;
    }
  }
  
  async function createNonCompliantUser() {
    try {
      const username = `test-user-${Date.now()}`;
      
      // Create user with simulation-mas tag
      await iamClient.send(
        new CreateUserCommand({
          UserName: username,
          Tags: [{
            Key: 'simulation-mas',
            Value: 'true'
          }]
        })
      );
  
      console.log(`Created user: ${username}`);
  
      // Get current password policy to show what we're violating
      const policy = await getPasswordPolicy();
  
      // Create login profile with non-compliant password
      try {
        await iamClient.send(
          new CreateLoginProfileCommand({
            UserName: username,
            Password: 'simple', // Intentionally weak password
            PasswordResetRequired: false
          })
        );
  
        console.log('Successfully set non-compliant password (This indicates a potential security issue)');
      } catch (error) {
        if (error.name === 'PasswordPolicyViolation') {
          console.log('\nPassword Policy Violation (Expected):');
          console.log('------------------------');
          console.log('Attempted Password: "simple"');
          console.log('Violations:');
          if (policy) {
            if (policy.MinimumPasswordLength > 6) {
              console.log(`- Too short (minimum length: ${policy.MinimumPasswordLength})`);
            }
            if (policy.RequireSymbols) {
              console.log('- Missing symbols');
            }
            if (policy.RequireNumbers) {
              console.log('- Missing numbers');
            }
            if (policy.RequireUppercaseCharacters) {
              console.log('- Missing uppercase characters');
            }
            if (policy.RequireLowercaseCharacters) {
              console.log('- Contains only lowercase characters');
            }
          }
          console.log('------------------------');
        }
        console.log('Failed to set password but user was created and tagged');
      }
  
      return { username, policy };
    } catch (error) {
      console.error('Error creating non-compliant user:', error);
      throw error;
    }
  }
  
  async function main() {
    try {
      console.log('Creating IAM user with non-compliant password...');
  
      // Create user with non-compliant password
      const { username, policy } = await createNonCompliantUser();
  
      console.log('\nTest completed!');
      console.log('------------------------');
      console.log(`Username: ${username}`);
      console.log('Tags: simulation-mas=true');
      console.log('Password Attempted: "simple"');
      if (policy) {
        console.log('Policy Requirements:');
        console.log(`- Minimum Length: ${policy.MinimumPasswordLength}`);
        console.log(`- Require Symbols: ${policy.RequireSymbols}`);
        console.log(`- Require Numbers: ${policy.RequireNumbers}`);
        console.log(`- Require Uppercase: ${policy.RequireUppercaseCharacters}`);
        console.log(`- Require Lowercase: ${policy.RequireLowercaseCharacters}`);
      }
      console.log('------------------------');
  
    } catch (error) {
      console.error('Error in main execution:', error);
      process.exit(1);
    }
  }
  
  if (require.main === module) {
    main();
  }
  
  module.exports = {
    createNonCompliantUser,
    getPasswordPolicy
  };
  