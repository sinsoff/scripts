#!/bin/bash
user=$1
pass=$2
planKey=$3
nubmerInJSON=2
spacer='\n===================================================\n'
counter=0
props=(--silent --show-error --fail -H "Accept:application/json" --user $user":"$pass) 

if [[ "$planKey" == "master" ]]
then
nubmerInJSON=1
fi

function warn() {
    message=$1
    code=$2
    printf  "$spacer\n$message\n$spacer" 1>&2 
    exit $code
}

function jsonValue() {
    KEY=$1
    num=$2
    awk -F "[,:}]" '{for(i=1;i<=NF;i++){if($i~/'$KEY'\042/){print $(i+1)}}}' | tr -d '"' | sed -n ${num}p
}

planStatus="$(curl ${props[@]}  https://bamboo.someCorp.com/rest/api/latest/plan/$planKey)"



if [[ $(echo "$planStatus" | jsonValue enabled $nubmerInJSON) == false ]]
then
    warn "The related testplan is disabled. \nPlease enable it manually: https://bamboo.someCorp.com/browse/$planKey" 0
fi

while [[ $(echo "$planStatus" | jsonValue isActive) == true  ]]
do
    echo "Another build is running. Stand in line..."
    sleep 60
    planStatus="$(curl ${props[@]}  https://bamboo.someCorp.com/rest/api/latest/plan/$planKey)"
    counter=$((counter+1))
    if [[ "$counter" -ge 60 ]] 
    then
       warn "Timeout expired. Tests've not finished after 60 minutes." 0
    fi 
done

counter=1

startStatus="$(curl -X POST ${props[@]}  https://bamboo.someCorp.com/rest/api/latest/queue/$planKey)"

printf "Build is started: \n${startStatus}"
printf "\n\nSee: https://bamboo.someCorp.com/browse/$planKey-$(echo $startStatus | jsonValue buildNumber)"

sleep 60

result="$(curl ${props[@]}  https://bamboo.someCorp.com/rest/api/latest/result/$planKey-$(echo $startStatus | jsonValue buildNumber))"

while [[ $(echo "$result" | jsonValue state) == Unknown ]] && [[ $(echo "$result" | jsonValue isValid) == true ]] 
do  
    printf "\nTestrun in progress..."
    sleep 60
    result="$(curl ${props[@]}  https://bamboo.someCorp.com/rest/api/latest/result/$planKey-$(echo $startStatus | jsonValue buildNumber))"
    counter=$((counter+1))
    if [[ "$counter" -ge 60 ]] 
    then
       warn "Timeout expired. Tests've not finished after 60 minutes. \nPlease, check: https://bamboo.someCorp.com/browse/$planKey-$(echo $startStatus | jsonValue buildNumber)" 0
    fi 
done

if [[ $(echo "$result" | jsonValue state) == Successful ]];
then
    printf  $spacer'\nTests passed!\n'$spacer
else 
    warn "Build's status: $(echo $result | jsonValue state). \nPlease, check https://bamboo.someCorp.com/browse/$planKey-$(echo $startStatus | jsonValue buildNumber)" 2
fi