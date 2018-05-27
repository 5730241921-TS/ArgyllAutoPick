var request = require('request');
var rp = require('request-promise');
var vision = require('@google-cloud/vision');
var cheerio = require('cheerio');
var tough = require('tough-cookie');
var fs = require('fs-extra')
const ENVIRONMENT = require('./env.js');
const username = ENVIRONMENT.username;
const password = ENVIRONMENT.password;
const tpin = ENVIRONMENT.tpin;
const rank = ENVIRONMENT.rank;

const client = new vision.ImageAnnotatorClient({
    keyFilename: ENVIRONMENT.keyFilename
});

var cookie = new tough.Cookie({
    key: "thanet",
    value: "thanet",
    domain: 'client.argyll-tech.com',
    httpOnly: false,
    maxAge: "Infinity"
});
var cookiejar = rp.jar();
cookiejar.setCookie(cookie, 'https://client.argyll-tech.com');


var state = 1;
var registerCredit = 0;
var cashCredit = 0;
var hedgeCredit = 0;
var allCampaign = new Array(3);
var bestCompaign = 0;
var lock = false;
var myinterval;
var invested = false;

var bot = () => {

    if (state == 1) {
        // login state
        if (!lock) {
            console.log("state1 unlock");
            console.log("time : ", new Date().toLocaleString('en-US'))
            lock = true;
            var option = {
                uri: 'https://client.argyll-tech.com/assets/captcha/captcha.php',
                jar: cookiejar,
                resolveWithFullResponse: true,
                headers: {
                    'User-Agent': 'Request-Promise'
                },
                encoding: null
            }
            rp.get(option)
                .then((res) => {
                    const buffer = Buffer.from(res.body, 'utf8');
                    return fs.writeFile('./captcha.png', buffer);
                }).then(() => {
                    return client
                        .textDetection('./captcha.png')
                        .then(results => {
                            const detections = results[0].textAnnotations;
                            return detections[1].description;
                        })
                        .catch(err => {
                            console.error('CAPCHA ERROR:', err);
                            return "";
                        });
                }).then((capcha) => {
                    console.log(capcha);
                    var option = {
                        method: 'POST',
                        uri: 'https://client.argyll-tech.com/login_check',
                        jar: cookiejar,
                        headers: {
                            'User-Agent': 'Request-Promise',
                        },
                        body: {
                            username: username,
                            password: password,
                            req: "ajax",
                            captcha: capcha
                        },
                        json: true
                    }
                    return rp(option).catch(() => {
                        console.log('Login check err');
                        state = 1;
                        lock = false;
                    });
                }).then((res) => {
                    if (res.status == 'ok') {
                        state = 2;
                        console.log("Login Success!!")
                    } else {
                        state = 1;
                    }
                    lock = false;
                })
                .catch((err) => {
                    console.log('Login Error');
                    console.log(err)
                    state = 1;
                    lock = false;
                });
        } else {
            console.log("state1 lock");
        }
    }
    if (state == 2) {
        //get credit
        if (!lock) {
            console.log("state2 unlock");
            console.log("time : ", new Date().toLocaleString('en-US'))
            lock = true;
            var option = {
                method: 'GET',
                uri: 'https://client.argyll-tech.com/user/dashboard',
                resolveWithFullResponse: true,
                headers: {
                    'User-Agent': 'Request-Promise'
                },
                jar: cookiejar
            }
            rp(option).then((res) => {
                if (res.statusCode == 200 && res.request.uri.path == "/user/dashboard") {
                    const $ = cheerio.load(res.body);
                    const stats = $('.dash-stat-main');
                    registerCredit = parseFloat(stats.eq(0).text().split(" ")[1].split(",").join("")); //0
                    cashCredit = parseFloat(stats.eq(3).text().split(" ")[1].split(",").join("")); //3
                    hedgeCredit = parseFloat(stats.eq(2).text().split(" ")[1].split(",").join("")); //2
                    console.log("registerCredit ", registerCredit);
                    console.log("cashCredit ", cashCredit);
                    console.log("hedgeCredit ", hedgeCredit);
                    // if (cashCredit > 1 || registerCredit > 1) {
                    //     state = 4;
                    // }
                    if (hedgeCredit >= 10) {
                        state = 3;
                    }
                    lock = false;
                } else {
                    state = 1;
                    console.log("else");
                    lock = false;
                }
            }).catch((err) => {
                state = 1;
                console.log("catch");
                console.log(err);
                lock = false;
            });
        } else {
            console.log("state2 lock");
        }
    }
    if (state == 3) {
        if (!lock) {
            console.log("state3 unlock");
            console.log("time : ", new Date().toLocaleString('en-US'))
            lock = true;
            var option = {
                uri: 'https://client.argyll-tech.com/user/campaigns',
                jar: cookiejar,
                resolveWithFullResponse: true,
                headers: {
                    'User-Agent': 'Request-Promise'
                }
            }
            rp.get(option).then((res) => {
                if (res.statusCode == 200 && res.request.uri.path == "/user/campaigns") {
                    const $ = cheerio.load(res.body);
                    const table = $('table');
                    for (var i = 0; i < 3; i++) {
                        var rows = [];
                        var news = [];
                        var table_rows = table.eq(i).find("tr");
                        for (var j = 0; j < table_rows.length; j++) {
                            var row = {};
                            var current = table_rows.eq(j);
                            if (current.children().eq(6).text() == '参加' || current.children().eq(6).text() == "Join") {
                                row.id = current.attr('id');
                                row.interest = current.children().eq(3).text()
                                row.event_time = current.attr("event_time");
                                //calculate remain amount
                                var amount = current.children().eq(5).children().eq(0).text();
                                amount = String(amount).split("/");
                                var use = amount[0].split(",").join("");
                                var total = amount[1].split(",").join("");
                                var remain = parseInt(total) - parseInt(use);
                                row.remainAmount = remain;
                                //calculate remain time
                                row.point = 0;
                                var date = new Date().getTime()
                                var new_date = new Date(row.event_time).getTime();
                                row.point += parseFloat(row.interest);
                                var roi = row.point;
                                var diff = new_date - date;
                                if (diff < 0)
                                    diff = 0;
                                var divDay = Math.floor(diff / (1000 * 60 * 60 * 24));
                                // var divHr = Math.floor((diff / (1000 * 60 * 60)) % 24);
                                // var divMin = Math.floor((diff / (1000 * 60)) % 60);
                                row.point = row.point / parseInt(divDay + 3);
                                //row.time = divDay + "Day " + divHr + "Hr " + divMin + "Min";
                                if (roi >= 1.9 && divDay == 0) {
                                    rows.push(row);
                                }
                            }
                        }
                        allCampaign[i] = rows;
                    }
                    //console.log(allCampaign);
                    for (var i = 0; i < 3; i++) {
                        allCampaign[i] = allCampaign[i].sort((a, b) => {
                            return b.point - a.point;
                        });
                    }
                    var bestCompaign = allCampaign[rank][0];

                    if (bestCompaign) {
                        var amt = Math.floor(hedgeCredit / 10) * 10;

                        if (amt > bestCompaign.remain) {
                            amt = bestCompaign.remain;
                        }
                        console.log("amount : ", amt);
                        if (bestCompaign != "") {
                            var data = {
                                lang: 'en',
                                campaign_id: bestCompaign.id,
                                bet_amt: amt,
                                tpin: tpin
                            }
                            var option = {
                                method: 'POST',
                                uri: 'https://client.argyll-tech.com/index.php/user/campaign_update_bet',
                                jar: cookiejar,
                                headers: {
                                    'User-Agent': 'Request-Promise',
                                },
                                body: data,
                                json: true
                            }
                            rp(option).then((res) => {
                                if (res.status == 'OK') {
                                    state = 2;
                                    lock = false;
                                } else {
                                    console.log("state not ok state 3");
                                    state = 2;
                                    lock = false;
                                }
                            }).catch((err) => {
                                console.log("err 3");
                                console.log(err);
                                state = 2;
                                lock = false;
                            });
                            var today = new Date().toLocaleString()
                            console.log(today);
                            console.log("Already pick roi." + roi)
                        }
                    } else {
                        state = 2;
                        lock = false;
                    }
                } else {
                    state = 1;
                    lock = false;
                }
            }).catch((err) => {
                console.log("err 3");
                console.log(err);
                state = 1;
                lock = false;
            });
        } else {
            console.log("state3 lock");
        }
    }

    if (state == 4) {
        if (!lock) {
            console.log("state3 unlock");
            console.log("time : ", new Date().toLocaleString('en-US'))
            lock = true;
            var amt = String(parseInt(cashCredit));
            var data = {
                lang: 'en',
                top_up_amt: amt,
                wallet_1: '0',
                credit_1: '0',
                wallet_2: '0',
                credit_2: amt,
                tpin: tpin
            }
            var option = {
                method: 'POST',
                uri: 'https://client.argyll-tech.com/index.php/user/product/update_top_up',
                jar: cookiejar,
                headers: {
                    'User-Agent': 'Request-Promise',
                },
                body: data,
                json: true
            }
            rp(option).then((res) => {
                if (res.status == 'OK') {
                    console.log("Top up is completed!!");
                    state = 2;
                    lock = false;

                } else {
                    console.log("Top up is failed!!");
                    console.log(res);
                    state = 2;
                    lock = false;
                }
            }).catch((err) => {
                console.log('Top up err');
                console.log(err);
                state = 2;
                lock = false;
            })
        } else {
            console.log("state4 lock");
        }


    }
};

myinterval = setInterval(bot, 5000);

var isStart = false;

setInterval(function () {
    var hour = new Date().getHours();
    if (hour >= 2 && hour < 23) {
        //start at 2.00 to 23.00
        if (!isStart) {
            console.log("start");
            clearInterval(myinterval);
            var randTime = Math.floor(Math.random() * 100) + 1;
            myinterval = setInterval(bot, 5000 + randTime);
            isStart = true;
        }
 //       if (invested) {
 //           console.log("Investment.");
 //           invested = false;
 //           clearInterval(myinterval);
  //          isStart = true;
  //      }
    } else {
        //without invested it will close at 23.00
        console.log("clear");
        clearInterval(myinterval);
        isStart = false;
    }
}, 60000);