const AWS = require('aws-sdk');
const s3 = new AWS.S3({
    region: 'us-east-1',
    accessKeyId: process.env.S3_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_KEY
});
const SES = new AWS.SES();
const baseStringHTML = '<html> <head> <meta http-equiv="content-type" content="text/html; charset=UTF-8" /> </head> <body text="#000000" bgcolor="#FFFFFF"> <p> </p> <div class="moz-forward-container"> <meta http-equiv="content-type" content="text/html; charset=UTF-8" /> <table width="1400" height="421" cellspacing="2" cellpadding="2" border="1"> <tbody> <tr> <th width="80" valign="middle" align="center">Allert level </th> <th width="50" valign="middle" align="center">Build</th> <th width="50" valign="middle" align="center">Environment</th> <th width="70" valign="middle" align="center">Branch</th> <th width="50" valign="middle" align="center">Error code</th> <th width="900" valign="middle" align="center"> Step text, error description<br /> </th> <th width="60" valign="middle" align="center">Bamboo</th> <th width="60" valign="middle" align="center">Splunk</th> <th width="400" valign="middle" align="center">Comments</th> </tr>';
let responseData;
let path = '';
let bucket = '';
let bambooLink = '';
let processFiles = {
    async listDirectories(prefix) {
        let params = { Bucket: bucket, Delimiter: '/', Prefix: prefix};
        let index = prefix.match(/\//g).length;
        try {
            responseData = await s3.listObjectsV2(params).promise();
            return responseData.CommonPrefixes.map(prefixObj => prefixObj.Prefix.split('/')[index]);
        } catch (err) {
            processData.errorLogs.push(err.message.toString());
        } 
    },
    async listFiles(prefix) {
        let params = { Bucket: bucket, Delimiter: '/', Prefix: prefix};
        let index = prefix.match(/\//g).length;
        try {
            responseData = await s3.listObjectsV2(params).promise();
            return responseData.Contents.map(prefixObj => prefixObj.Key.split('/')[index]);
        } catch (err) {
            processData.errorLogs.push(err.message.toString());
        } 
    },
    async getObjectData (prefix) {
        let params = { Bucket: bucket, Key: `${path}/${prefix}`};
        try {
            responseData = await s3.getObject(params).promise();
            return JSON.parse(responseData.Body.toString());
        } catch (err) {
            processData.errorLogs.push(err.message.toString() + ` File: ${prefix}`);
        }
    },
    async putObjectToS3 (prefix, data) {
        let params = { Bucket: bucket, Key: `${path}/${prefix}`, Body: new Buffer(data)};
        try {
            responseData = await s3.putObject(params).promise();
            console.log(responseData);
        } catch (err) {
            processData.errorLogs.push(err.message.toString());
        }
    },
    async sendEmailWithReport (htmlData, serviceName) {
        let params = {
            Destination: {
                ToAddresses: process.env.SES_SEND_TO.split(',').map(email => email.trim())
            },
            Message: { 
                Body: { 
                    Html: {
                        Charset: "UTF-8",
                        Data: htmlData
                    },
                    Text: {
                        Charset: "UTF-8",
                        Data: "This is text"
                    }
                },
                Subject: {
                    Charset: 'UTF-8',
                    Data: `Overview of the failed tests in ${serviceName} (${new Date().getMonth()+1}.${new Date().getDate()})`
                }
            },
            Source: 'aws-no-reply@aws.com',
        };
        try {
            responseData = await SES.sendEmail(params).promise();
            console.log(responseData);
        } catch (err) {
            processData.errorLogs.push(err.message.toString());
        }
    }
};
let processData = {
    resultData: [],
    allparsedBuilds: {},
    stepsWithoutSnippets:[],
    lastparsedBuild: {},
    errorLogs: [],
    async checkLastParsed() {
        try {
            this.lastparsedBuild = await processFiles.getObjectData('last_build_parsed.json');
        } catch (err) {
            throw new Error(err);
        }
    },
    cleanUpVars() {
        this.resultData = [];
        this.allparsedBuilds = {};
        this.stepsWithoutSnippets = [];
    }
};

async function createHTMLreport (sourceArray, serviceName) {
    let tableRows = baseStringHTML;
    if (sourceArray.length !== 0) {
        for (let row of sourceArray) {
            tableRows += `
            <tr>
                <td valign="middle" align="center"><br /></td>
                <td valign="middle" align="center">${row.build}</td>
                <td valign="middle" align="center">${row.env}</td>
                <td valign="middle" align="center">${row.branch}</td>
                <td valign="middle" align="center">${row.code}</td>
                <td valign="middle" align="center" width="600">
                <div align="center"><b>${row.keyWord} </b>${row.stepName}<font color="#330033"><span> </span></font><span class="duration" style="box-sizing: border-box;position: relative; float: right;"></span></div>
                <div <div class="info" style="box-sizing: border-box; overflow: auto; font-family: Menlo, Monaco, Consolas, &quot;Courier New&quot;, monospace; font-size: 13px; display:
                    block; padding: 9.5px; margin: 0px 0px 10px; line-height: 1.42857; color: rgb(51, 51, 51); word-break: break-all; word-wrap: break-word; background-color: rgb(245, 245, 245); border: 1px solid rgb(204, 204, 204); 
                    border-radius: 4px;">\n${row.error}
                </div>
                </td>
                <td valign="middle" align="center"><a href="${row.bamboo}" moz-do-not-send="true">Link</a></td>`;
            if (row.splunk == 'No splunk logs!') {
                tableRows += `<td valign="middle" align="center">${row.splunk}</td>`;
            } else {
                tableRows += `<td valign="middle" align="center"><a href="${row.splunk}" moz-do-not-send="true">Link</a></td>`;
            }
            tableRows += '<td valign="top" align="left">Add comments there</td></tr>';
        }
        tableRows += '</tbody> </table> </blockquote> </div> <br /><b>The following information is for QA only!</b><br />List of parsed builds for each env:';
        for (let env in processData.allparsedBuilds) {
            if (env === 'warnings') {
                if (processData.allparsedBuilds[env].length !== 0) {
                    tableRows += `<br />Tests without snippets:`;
                    for (let obj of processData.allparsedBuilds[env]) {
                        tableRows += `<br />${JSON.stringify(obj)}<br />`;
                    }
                }
            } else {
                tableRows += `<br />${env}: ${JSON.stringify(processData.allparsedBuilds[env])}`;
            }
        }
        tableRows += '</body> </html>';
    } else {
        tableRows = '<html> <head> <meta http-equiv="content-type" content="text/html; charset=UTF-8" />All builds are passed.</head></html>';
    }
    await processFiles.putObjectToS3(`${serviceName}_report.html`, tableRows);
    await processFiles.sendEmailWithReport(tableRows, serviceName);
}

function createTableEntriesForBuild (report, environment, buildNumber) {
    let bambooPlanKey = environment.split('_')[1];
    let bambooJobKey = environment.split('_')[2];
    let bambooTestBranch = environment.split('_')[3];
    for (let feature of report) {
        feature.elements.forEach(scenario => {
            scenario.steps.forEach(step => {
                //add check for "step haven't found"
                if (step.result.status === 'failed') {
                    let tableRow = {};
                    let afterStepsArray = scenario.steps.filter(step => (step.keyword === 'After') && step.embeddings);
                    let stepWithLogs = afterStepsArray.filter(step => !step.embeddings[0].data.includes('Hook name:'))[0];
                    if (step.result.error_message.includes('Error: function timed out after') || stepWithLogs.embeddings[0].data.includes('Error! No correlation ID in response!') || stepWithLogs.embeddings[0].data == '' || !stepWithLogs.embeddings[0].data.includes('---RESPONSE:')) {
                        tableRow.splunk = 'No splunk logs!';
                    } else if(stepWithLogs.embeddings[0].data.includes('error:')){
                        //tableRow.splunk = stepWithLogs.embeddings[0].data.split('<a href=')[1].split(' target=_')[0];
                        let splunkLink = stepWithLogs.embeddings[0].data.split('SplunkLink: ')[1].split(' <br>')[0];
                    }
                    tableRow.build = buildNumber;
                    tableRow.env = environment.split('_')[0].toUpperCase();
                    tableRow.keyWord = step.keyword;
                    tableRow.stepName = step.name;
                    tableRow.branch = bambooTestBranch;
                    tableRow.error = step.result.error_message.split(/\n/)[0];
                    tableRow.bamboo = `${bambooLink}/artifact/${bambooPlanKey}/${bambooJobKey}/build-${buildNumber}/Cucumber-Test-Report/cucumber-html-report/index.html`;
                    if (tableRow.error.includes('got status code:')) {
                        tableRow.code = tableRow.error.split('got status code:')[1];
                    } else {
                        tableRow.code = '';
                    }
                    processData.resultData.push(tableRow);
                } else if (step.result.status === 'undefined') {
                    let dataForQA = {
                        env: environment.split('_')[0],
                        build: buildNumber,
                        feature: feature.name,
                        scenario: scenario.name
                    };
                    processData.stepsWithoutSnippets.push(dataForQA);
                }
            });
        });
    }
}

async function writeAllDataToFiles(serviceName, isAppend) {
    //the result of the 24-h check
    if (isAppend) {
        let dataFromFile = await processFiles.getObjectData(`list_parsed_builds_${serviceName}.json`);
        for (let env in dataFromFile) {
            if (!processData.allparsedBuilds[env]) {
                processData.allparsedBuilds[env] = [];
            }
            processData.allparsedBuilds[env] = dataFromFile[env].concat(processData.allparsedBuilds[env]);
        }
        let generatedReport = await processFiles.getObjectData(`data_for_table_${serviceName}.json`);
        processData.resultData = generatedReport.concat(processData.resultData);
    }
    await createHTMLreport(processData.resultData, serviceName.substr(0,2));
    await processFiles.putObjectToS3(`data_for_table_${serviceName}.json`, JSON.stringify(processData.resultData, null, 4));
    await processFiles.putObjectToS3(`list_parsed_builds_${serviceName}.json`, JSON.stringify(processData.allparsedBuilds, null, 4));
    await processFiles.putObjectToS3('last_build_parsed.json', JSON.stringify(processData.lastparsedBuild, null, 4));
}

async function parseAllReportsFromService (serviceName, isAppend) { 
    let allEnvsArray = await processFiles.listDirectories(`${path}/`);
    //filter folders by service's name
    let serviceEnvsArray = allEnvsArray.filter(file => file.includes(serviceName));
    //iterate all envs for selected service
    for (let env of serviceEnvsArray) {
        let buildNumbersArray = [];
        let envName = env.split('_')[0];
        let reportsArray = await processFiles.listFiles(`${path}/${env}/report/`);
        processData.lastparsedBuild[envName] = processData.lastparsedBuild[envName] ? processData.lastparsedBuild[envName] : 0;
        //filter reports. we need greater than the last parsed
        reportsArray = reportsArray.filter(build => build.match(/\d+/).map(Number)[0] > processData.lastparsedBuild[envName]);
        //iterate all build's reports for selected environment
        for (let buildReportName of reportsArray) {
            let buildNumber = buildReportName.match(/\d+/).map(Number)[0];
            buildNumbersArray.push(buildNumber);
            let buildData = await processFiles.getObjectData(`${env}/report/${buildReportName}`);
            if (buildData) {
                await createTableEntriesForBuild(buildData, env, buildNumber);
            } else {
                continue;
            }
            
        }
        if (buildNumbersArray.length !== 0 && processData.lastparsedBuild[envName] < Math.max(...buildNumbersArray)) {
            processData.lastparsedBuild[envName] = Math.max(...buildNumbersArray);
        }
        if (processData.allparsedBuilds[envName]) {
            processData.allparsedBuilds[envName] = processData.allparsedBuilds[envName].concat(buildNumbersArray);
        } else {
            processData.allparsedBuilds[envName] = buildNumbersArray;
        }
    }
    processData.allparsedBuilds.warnings = processData.stepsWithoutSnippets;
    await writeAllDataToFiles(serviceName, isAppend);
    processData.cleanUpVars();
}
exports.handler = async function parseReports (event, context) {
    let isAppend = true;
    try {
        await processData.checkLastParsed();
        if ((Math.floor((Date.now() - new Date(processData.lastparsedBuild.reportCreationDTM).getTime()) / (1000*60*60)) >= 24) || (event['detail-type'] == "Scheduled Event")) {
            processData.lastparsedBuild.reportCreationDTM = new Date().toISOString();
            isAppend = false;
        }
        await parseAllReportsFromService('pa-', isAppend);
        await parseAllReportsFromService('gl-', isAppend);
    } catch (err) {
        console.log(err)
        await processFiles.sendEmailWithReport(`<b>Something goes wrong!</b><br><br><b>Error:</b> ${err}<br><br><b>Error from Amazon:</b> ${processData.errorLogs}`);
        return {
        "statusCode": 408,
        "headers": {},
        "body": JSON.stringify({AppendToPrevious: isAppend, err: err.toString(), errorsFromAws: processData.errorLogs}),
        "isBase64Encoded": false
    };
    }
    return {
        "statusCode": 200,
        "headers": {},
        "body": JSON.stringify({AppendToPrevious: isAppend, resultMessage: "Success!", errorsFromAws: processData.errorLogs}),
        "isBase64Encoded": false
    };
};