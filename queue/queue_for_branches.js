const rp = require('request-promise');
const headers = {
    Accept: 'application/json',
    Authorization: `Basic ${new Buffer(`${process.argv[2]}:${process.argv[3]}`).toString('base64')}`
};
const planName = process.argv[4];
const branchName = process.argv[5];
async function request (method, api, body) {
    let options = {
        timeout: 10000,
        keepAlive: true,
        headers: headers,
        uri: `https://bamboo.someCorp.com/rest/api/latest/${api}`,
        method: method,
        body: body,
        json: true,
        simple: false,
        resolveWithFullResponse: true
    };
    return await rp(options);
};

function delay(sec) {
    return new Promise(resolve => setTimeout(resolve, sec*1000));
};

async function checkBlueBranch () {
    let planReponse = await request('GET', `plan/${planName}`);
    if (planReponse.body.isActive == true) {
        do {
            console.info('A build is executing on the blue branch. Stand in line....');
            await delay(60);
            planReponse = await request('GET', `plan/${planName}`);

        } while (planReponse.body.isActive == true);
    } 
    console.info('Everything is fine. Starting tests...');
};


async function checkGreenBranch () {
    let planReponse = await request('GET', `plan/${planName}`);
    if (planReponse.body.isActive == true) {
        console.info(`A build is executing on the green branch. Stopping it... `);
        planReponse = await request('GET', `result/${planName}-latest`);
        let buildNumber = planReponse.body.buildNumber;
        if (!planReponse.body.progress) {
            let lastBuildStatus;
            do {
                ++buildNumber;
                lastBuildStatus = await request('GET', `result/status/${planName}-${buildNumber}`);
                console.info(`Build ${planName}-${buildNumber} is checked...`);
            } while (lastBuildStatus.statusCode == 404 && buildNumber != Number(planReponse.body.buildNumber + 10));
            if (lastBuildStatus.statusCode == 404) {
                console.error('Could not find the active build on the green branch. Please stop it manually and try again');
            }
        }
        await rp({
            headers: headers,
            uri: `https://bamboo.someCorp.com/build/admin/stopPlan.action?planResultKey=${planName}-${buildNumber}`,
            method: 'GET'
        });
        console.info('The green build is stopped.');
        let body = {
            content: '[Automation Hook] The Build has been stopped by a deployment process.'
        };
        await request('POST', `result/${planName}-${buildNumber}/comment`, body);
        
    } else {
        console.info('There are no active builds on the green branch.');
    }
};

if (!branchName.includes('dev')) {
    if (branchName.includes('02')) {
        checkGreenBranch();
    } else {
        checkBlueBranch();
    }
}; 