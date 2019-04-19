const rp = require('request-promise');
const spacer = '\n===================================================\n';
const headers = {
    Accept: 'application/json',
    Authorization: `Basic ${new Buffer('user:password').toString('base64')}`
};
const planName = '';
let counter = 0;
async function request (method, api, body) {
    let options = {
        timeout: 20000,
        keepAlive: true,
        headers: headers,
        uri: `https://bamboo.someCorp.com/rest/api/latest/${api}`,
        method: method,
        body: body
    };
    try {
        return JSON.parse(await rp(options));
    } catch (err) {
        console.error(err.message);
        process.exit();
    }
}

function logWarning (message) {
    console.error(`${spacer}\n${message}\n${spacer}`);
    process.exit();
}

async function checkPlan () {
    let planStatus = await request('GET', `plan/${planName}`);
    if (planStatus.enabled == false) {
        logWarning(`The related testplan is disabled. Please enable it manually: https://bamboo.someCorp.com/browse/$($planKey)`);
    }
    setTimeout(() => {
        if (planStatus.isActive == true && counter <= 20) {
            console.log('Another build is running. Stand in line...');
            counter++;
            checkPlan();
        }
    }, 3000);    
};

checkPlan();

