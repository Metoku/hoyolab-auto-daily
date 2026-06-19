#!/usr/bin/env node

const cookies = process.env.COOKIE.split('\n').map(s => s.trim())
const games = process.env.GAMES.split('\n').map(s => s.trim())
const discordWebhook = process.env.DISCORD_WEBHOOK
const discordUser = process.env.DISCORD_USER
const msgDelimiter = ':'
const messages = []
const endpoints = {
  zzz: 'https://sg-act-nap-api.hoyolab.com/event/luna/zzz/os/sign?act_id=e202406031448091',
  gi:  'https://sg-hk4e-api.hoyolab.com/event/sol/sign?act_id=e202102251931481',
  hsr: 'https://sg-public-api.hoyolab.com/event/luna/os/sign?act_id=e202303301540311',
  hi3: 'https://sg-public-api.hoyolab.com/event/mani/sign?act_id=e202110291205111',
  tot: 'https://sg-public-api.hoyolab.com/event/luna/os/sign?act_id=e202202281857121',
}

// Metadata for rich Discord embeds
const gamesMeta = {
  gi: {
    fullName: 'Genshin Impact',
    gameId: 2,
    author: 'Paimon',
    icon: 'https://fastcdn.hoyoverse.com/static-resource-v2/2024/04/12/b700cce2ac4c68a520b15cafa86a03f0_2812765778371293568.png',
    color: 0xDCC07A, // Warm gold from Genshin's UI and logo
    infoUrl: 'https://sg-hk4e-api.hoyolab.com/event/sol/info',
    homeUrl: 'https://sg-hk4e-api.hoyolab.com/event/sol/home',
  },
  hsr: {
    fullName: 'Honkai: Star Rail',
    gameId: 6,
    author: 'PomPom',
    icon: 'https://fastcdn.hoyoverse.com/static-resource-v2/2024/04/12/74330de1ee71ada37bbba7b72775c9d3_1883015313866544428.png',
    color: 0x4B6ED9, // Blue-purple of the Astral Express logo
    infoUrl: 'https://sg-public-api.hoyolab.com/event/luna/os/info',
    homeUrl: 'https://sg-public-api.hoyolab.com/event/luna/os/home',
  },
  hi3: {
    fullName: 'Honkai Impact 3rd',
    gameId: 1,
    author: 'Kiana',
    icon: 'https://fastcdn.hoyoverse.com/static-resource-v2/2024/02/29/3d96534fd7a35a725f7884e6137346d1_3942255444511793944.png',
    color: 0xE8173D, // Signature red from the HI3 logo
    infoUrl: 'https://sg-public-api.hoyolab.com/event/mani/info',
    homeUrl: 'https://sg-public-api.hoyolab.com/event/mani/home',
  },
  zzz: {
    fullName: 'Zenless Zone Zero',
    gameId: 8,
    author: 'Eous',
    icon: 'https://hyl-static-res-prod.hoyolab.com/communityweb/business/nap.png',
    color: 0xF5C545, // Bright yellow-gold from ZZZ's UI and logo
    infoUrl: 'https://sg-public-api.hoyolab.com/event/luna/zzz/os/info',
    homeUrl: 'https://sg-public-api.hoyolab.com/event/luna/zzz/os/home',
  },
  tot: {
    fullName: 'Tears of Themis',
    gameId: 4,
    author: 'Rosa',
    icon: 'https://hyl-static-res-prod.hoyolab.com/communityweb/business/tot.png',
    color: 0x8B5BDE, // Purple from Tears of Themis branding
    infoUrl: 'https://sg-public-api.hoyolab.com/event/luna/os/info',
    homeUrl: 'https://sg-public-api.hoyolab.com/event/luna/os/home',
  },
}

// Stores successful check-in data for rich embeds
const checkInResults = []

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function fixRegion(region) {
  const map = {
    os_cht: 'TW', prod_gf_sg: 'TW', prod_official_cht: 'TW',
    os_asia: 'SEA', prod_gf_jp: 'SEA', prod_official_asia: 'SEA',
    eur01: 'EU', os_euro: 'EU', prod_gf_eu: 'EU', prod_official_eur: 'EU',
    usa01: 'NA', os_usa: 'NA', prod_gf_us: 'NA', prod_official_usa: 'NA',
  }
  return map[region] ?? 'Unknown'
}

async function getAccountDetails(cookie, game) {
  const meta = gamesMeta[game]
  if (!meta) return null

  try {
    const ltuid = cookie.match(/ltuid(?:|_v2)=([^;]+)/)?.[1]
    if (!ltuid) throw new Error('Could not extract ltuid from cookie')

    const res = await fetch(`https://bbs-api-os.hoyolab.com/game_record/card/wapi/getGameRecordCard?uid=${ltuid}`, {
      headers: { 'User-Agent': USER_AGENT, Cookie: cookie }
    })
    const data = await res.json()
    if (data.retcode !== 0) throw new Error(`getGameRecordCard failed: ${JSON.stringify(data)}`)

    const account = data.data.list.find(a => a.game_id === meta.gameId)
    if (!account) throw new Error(`No ${meta.fullName} account found for ltuid ${ltuid}`)

    return {
      uid: account.game_role_id,
      nickname: account.nickname,
      rank: account.level,
      region: fixRegion(account.region),
    }
  } catch (e) {
    log('debug', `getAccountDetails(${game}): ${e.message}`)
    return null
  }
}

async function getSignInfo(cookie, game) {
  const meta = gamesMeta[game]
  if (!meta) return null

  try {
    const actId = new URL(endpoints[game]).searchParams.get('act_id')
    const res = await fetch(`${meta.infoUrl}?act_id=${actId}`, {
      headers: { Cookie: cookie, 'x-rpc-signgame': game }
    })
    const data = await res.json()
    if (data.retcode !== 0) return null

    return {
      total: data.data.total_sign_day,
      today: data.data.today,
      isSigned: data.data.is_sign,
    }
  } catch (e) {
    log('debug', `getSignInfo(${game}): ${e.message}`)
    return null
  }
}

async function getAwards(cookie, game) {
  const meta = gamesMeta[game]
  if (!meta) return null

  try {
    const actId = new URL(endpoints[game]).searchParams.get('act_id')
    const res = await fetch(`${meta.homeUrl}?act_id=${actId}`, {
      headers: { Cookie: cookie, 'x-rpc-signgame': game }
    })
    const data = await res.json()
    if (data.retcode !== 0) return null

    return data.data.awards
  } catch (e) {
    log('debug', `getAwards(${game}): ${e.message}`)
    return null
  }
}

let hasErrors = false
let latestGames = []

async function run(cookie, games) {
  if (!games) {
    games = latestGames
  } else {
    games = games.split(' ')
    latestGames = games
  }

  for (let game of games) {
    game = game.toLowerCase()

    log('debug', `\n----- CHECKING IN FOR ${game} -----`)

    if (!(game in endpoints)) {
      log('error', `Game ${game} is invalid. Available games are: zzz, gi, hsr, hi3, and tot`)
      continue
    }

    // begin check in
    const endpoint = endpoints[game]
    const url = new URL(endpoint)
    const actId = url.searchParams.get('act_id')

    url.searchParams.set('lang', 'en-us')

    const body = JSON.stringify({
      lang: 'en-us',
      act_id: actId
    })

    // headers from valid browser request
    const headers = new Headers()

    headers.set('accept', 'application/json, text/plain, */*')
    headers.set('accept-encoding', 'gzip, deflate, br, zstd')
    headers.set('accept-language', 'en-US,en;q=0.6')
    headers.set('connection', 'keep-alive')

    headers.set('origin', 'https://act.hoyolab.com')
    headers.set('referrer', 'https://act.hoyolab.com')
    headers.set('content-type', 'application.json;charset=UTF-8')
    headers.set('cookie', cookie)

    headers.set('sec-ch-ua', '"Not/A)Brand";v="8", "Chromium";v="126", "Brave";v="126"')
    headers.set('sec-ch-ua-mobile', '?0')
    headers.set('sec-ch-ua-platform', '"Linux"')
    headers.set('sec-fetch-dest', 'empty')
    headers.set('sec-fech-mode', 'cors')
    headers.set('sec-fetch-site', 'same-site')
    headers.set('sec-gpc', '1')

    headers.set("x-rpc-signgame", game)

    headers.set('user-agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')

    const res = await fetch(url, { method: 'POST', headers, body })
    const json = await res.json()
    const code = String(json.retcode)
    const successCodes = {
      '0': 'Successfully checked in!',
      '-5003': 'Already checked in for today',
    }

    // success responses
    if (code in successCodes) {
      log('info', game, `${successCodes[code]}`)

      // Fetch rich data for Discord embed (only on fresh check-in or already signed)
      if (gamesMeta[game] && discordWebhook) {
        const [account, signInfo, awards] = await Promise.all([
          getAccountDetails(cookie, game),
          getSignInfo(cookie, game),
          getAwards(cookie, game),
        ])

        if (account && signInfo && awards) {
          // total_sign_day reflects today's count after signing in; for -5003 it's already correct
          const totalToday = signInfo.total
          const awardIndex = Math.max(0, totalToday - 1)
          const award = awards[awardIndex]

          checkInResults.push({
            game,
            meta: gamesMeta[game],
            account,
            total: totalToday,
            result: successCodes[code],
            award: award ? { name: award.name, count: award.cnt, icon: award.icon } : null,
          })
        }
      }

      continue
    }

    // error responses
    const errorCodes = {
      '-100': 'Error not logged in. Your cookie is invalid, try setting up again',
      '-10002': 'Error not found. You haven\'t played this game'
    }

    log('debug', game, `Headers`, Object.fromEntries(res.headers))
    log('debug', game, `Response`, json)

    if (code in errorCodes) {
      log('error', game, `${errorCodes[code]}`)
      continue
    }

    log('error', game, `Error undocumented, report to Issues page if this persists`)
  }
}

// custom log function to store messages
function log(type, ...data) {

  // log to real console
  console[type](...data)

  // ignore debug and toggle hasErrors
  switch (type) {
    case 'debug': return
    case 'error': hasErrors = true
  }

  // check if it's a game specific message, and set it as uppercase for clarity, and add delimiter
  if(data[0] in endpoints) {
    data[0] = data[0].toUpperCase() + msgDelimiter
  }

  // serialize data and add to messages
  const string = data
    .map(value => {
      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2).replace(/^"|"$/, '')
      }

      return value
    })
    .join(' ')

  messages.push({ type, string })
}

async function sendDiscordEmbed(entry) {
  const embed = {
    color: entry.meta.color,
    title: `${entry.meta.fullName} Daily Check-In`,
    author: {
      name: `${entry.account.uid} - ${entry.account.nickname}`,
      icon_url: entry.meta.icon,
    },
    fields: [
      { name: 'Nickname',        value: String(entry.account.nickname), inline: true },
      { name: 'UID',             value: String(entry.account.uid),      inline: true },
      { name: 'Rank',            value: String(entry.account.rank),     inline: true },
      { name: 'Region',          value: String(entry.account.region),   inline: true },
      ...(entry.award ? [{ name: "Today's Reward", value: `${entry.award.name} x${entry.award.count}`, inline: true }] : []),
      { name: 'Total Check-Ins', value: String(entry.total),            inline: true },
      { name: 'Result',          value: entry.result,                   inline: false },
    ],
    ...(entry.award ? { thumbnail: { url: entry.award.icon } } : {}),
    timestamp: new Date().toISOString(),
    footer: { text: `${entry.meta.fullName} Daily Check-In` },
  }

  const res = await fetch(discordWebhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: entry.meta.author,
      avatar_url: entry.meta.icon,
      embeds: [embed],
    }),
  })

  if (res.status !== 204) {
    log('error', `Error sending Discord embed for ${entry.meta.fullName}`)
  }
}

// must be function to return early
async function discordWebhookSend() {
  log('debug', '\n----- DISCORD WEBHOOK -----')

  if (!discordWebhook.toLowerCase().trim().startsWith('https://discord.com/api/webhooks/')) {
    log('error', 'DISCORD_WEBHOOK is not a Discord webhook URL. Must start with `https://discord.com/api/webhooks/`')
    return
  }

  // Send one message per check-in result, each with its own game bot username/avatar
  for (const entry of checkInResults) {
    await sendDiscordEmbed(entry)
    // Small delay to avoid hitting Discord rate limits
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // If there were any errors, send those as a single plain-text follow-up
  const errorLines = messages.filter(m => m.type === 'error')
  if (errorLines.length > 0) {
    let content = discordUser ? `<@${discordUser}>\n` : ''
    content += errorLines.map(m => `(ERROR) ${m.string}`).join('\n')

    const res = await fetch(discordWebhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    })

    if (res.status !== 204) {
      log('error', 'Error sending error summary to Discord webhook')
      return
    }
  }

  log('info', 'Successfully sent message(s) to Discord webhook!')
}

if (!cookies || !cookies.length) {
  throw new Error('COOKIE environment variable not set!')
}

if (!games || !games.length) {
  throw new Error('GAMES environment variable not set!')
}

for (const index in cookies) {
  log('info', `-- CHECKING IN FOR ACCOUNT ${Number(index) + 1} --`)
  await run(cookies[index], games[index])
}

if (discordWebhook && URL.canParse(discordWebhook)) {
  await discordWebhookSend()
}

if (hasErrors) {
  console.log('')
  throw new Error('Error(s) occured.')
}
