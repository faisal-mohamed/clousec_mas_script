const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const folderPath = "./scripts"; // Replace with your folder path

// Function to run a single script
const runScript = (filePath) => {
  return new Promise((resolve) => {
    console.log(`Running: ${filePath}`);
    exec(`node ${filePath}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error in ${filePath}:\n${stderr}`);
      } else {
        console.log(`Output of ${filePath}:\n${stdout}`);
      }
      resolve(); // Ensures the next script runs after this one completes
    });
  });
};

// Function to run all scripts sequentially
const runAllScripts = async () => {
  const files = fs.readdirSync(folderPath).filter(file => file.endsWith(".js"));

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    await runScript(filePath); // Ensures synchronous execution
  }
};

runAllScripts();
