const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const folderPath = "./scripts"; // Replace with the folder containing your scripts

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
      resolve(); // Continue to the next script, even if there's an error
    });
  });
};

// Function to run all scripts sequentially
const runAllScripts = async () => {
  try {
    const files = fs.readdirSync(folderPath);

    // Filter only .js files
    const scriptFiles = files.filter((file) => path.extname(file) === ".js");

    for (const file of scriptFiles) {
      const filePath = path.join(folderPath, file);
      await runScript(filePath);
    }

    console.log("All scripts executed.");
  } catch (err) {
    console.error("Error reading the folder or running the scripts:", err);
  }
};

runAllScripts();
