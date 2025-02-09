
﻿# Clousec MAS Rules Script in JavaScript

This repository contains Node.js scripts for simulating the non compilant scenario for the MAS rules Follow the steps below to set up and run the scripts on your local machine.

## Prerequisites

Before running the scripts, ensure you have the following installed on your system:

- [Node.js](https://nodejs.org/) (v14 or later recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)

## Setup Instructions

1. **Clone the Repository**

   Clone the repository to your local machine using the following command:

   ```bash
   git clone https://github.com/faisal-mohamed/clousec_mas_script.git
   cd clousec_mas_script



2. **Install Dependencies**

   Run npm install

   ```bash
   npm install




3. **Add Env**

   Add the necessary env variables like
   ```bash
   AWS_ACCESS_KEY_ID
   AWS_SECRET_ACCESS_KEY
   AWS_SESSION_TOKEN
   AWS_ACCOUNT_ID
   EC2_AMI_ID
   DOMAIN_NAME
   DESTINATION_REGION
   AWS_REGION
   VPC_ID
   SUBNET_ID
   SUBNET_IDS                //some services require more than one subet for high Availability

   //some services are created in different account, so specify the access key id of those
   AWS_ACCESS_KEY_ID_FOR_CLOUDTRAIL_DISABLE
   AWS_SECRET_ACCESS_KEY_FOR_CLOUDTRAIL_DISABLE
   AWS_SESSION_TOKEN_FOR_CLOUDTRAIL_DISABLE



5. **Run a Script**

   To execute all the script at once run the index.js file which inturn runs all the script automatically one by one in sequential manner

   ```bash
   node index.js



