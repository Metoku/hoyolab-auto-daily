#!/usr/bin/env node

const cookies = process.env.COOKIE.split('\n').map(s => s.trim())
const games = process.env.GAMES.split('\n').map(s => s.trim())
const discordWebhook = process.env.DISCORD_WEBHOOK
const discordUser = process.env.DISCORD_USER
const githubToken = process.env.GITHUB_TOKEN
const githubRepo = process.env.GITHUB_REPOSITORY // automatically set by GitHub Actions
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
// Stores error data for rich error embeds
const errorEmbeds = []

// Games that support code redemption via the ennead.cc API
const redeemableGames = {
  gi:  { param: 'genshin',  baseUrl: 'https://sg-hk4e-api.hoyoverse.com/common/apicdkey/api/webExchangeCdkey',         method: 'GET',  bizKey: 'hk4e_global',  regionMap: { SEA: 'os_asia', NA: 'os_usa', EU: 'os_euro', TW: 'os_cht' } },
  hsr: { param: 'starrail', baseUrl: 'https://sg-hkrpg-api.hoyoverse.com/common/apicdkey/api/webExchangeCdkeyRisk',    method: 'POST', bizKey: 'hkrpg_global', regionMap: { NA: 'prod_official_usa', EU: 'prod_official_eur', SEA: 'prod_official_asia', TW: 'prod_official_cht' } },
  zzz: { param: 'zenless',  baseUrl: 'https://public-operation-nap.hoyoverse.com/common/apicdkey/api/webExchangeCdkey', method: 'GET',  bizKey: 'nap_global',   regionMap: { TW: 'prod_gf_sg', SEA: 'prod_gf_jp', EU: 'prod_gf_eu', NA: 'prod_gf_us' } },
}



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

// --- Persistent redeemed codes via GitHub Repository Variables ---

const VAR_NAME = 'REDEEMED_CODES'
const githubApiBase = `https://api.github.com/repos/${githubRepo}/actions/variables`
const githubHeaders = {
  'Authorization': `Bearer ${githubToken}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
}

// Returns { gi: Set(['CODE1', 'CODE2']), hsr: Set([...]), ... }
async function loadRedeemedCodes() {
  try {
    const res = await fetch(`${githubApiBase}/${VAR_NAME}`, { headers: githubHeaders })
    if (res.status === 404) {
      console.log('[redeemed-codes] No existing variable found, starting fresh')
      return {}
    }
    const data = await res.json()
    console.log('[redeemed-codes] Loaded raw value:', data.value)
    const parsed = JSON.parse(data.value)
    // Convert arrays back to Sets
    const result = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, new Set(v)]))
    console.log('[redeemed-codes] Loaded codes:', JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, [...v]]))))
    return result
  } catch (e) {
    console.log(`[redeemed-codes] loadRedeemedCodes error: ${e.message}`)
    return {}
  }
}

// Saves the redeemed codes map back to the GitHub variable
async function saveRedeemedCodes(codesMap) {
  try {
    // Convert Sets to arrays for JSON serialization
    const serialized = JSON.stringify(
      Object.fromEntries(Object.entries(codesMap).map(([k, v]) => [k, [...v]]))
    )
    console.log('[redeemed-codes] Saving:', serialized)

    // Try PATCH first (update), fall back to POST (create)
    const patchRes = await fetch(`${githubApiBase}/${VAR_NAME}`, {
      method: 'PATCH',
      headers: githubHeaders,
      body: JSON.stringify({ name: VAR_NAME, value: serialized }),
    })

    console.log('[redeemed-codes] PATCH status:', patchRes.status)

    if (patchRes.status === 404) {
      const postRes = await fetch(githubApiBase, {
        method: 'POST',
        headers: githubHeaders,
        body: JSON.stringify({ name: VAR_NAME, value: serialized }),
      })
      console.log('[redeemed-codes] POST status:', postRes.status)
    }
  } catch (e) {
    console.log(`[redeemed-codes] saveRedeemedCodes error: ${e.message}`)
  }
}

async function fetchActiveCodes(game) {
  try {
    const config = redeemableGames[game]
    if (!config) return []
    const res = await fetch(`https://api.ennead.cc/mihoyo/${config.param}/codes`)
    const data = await res.json()
    return data.active ?? []
  } catch (e) {
    log('debug', `fetchActiveCodes(${game}): ${e.message}`)
    return []
  }
}

function extractRedemptionCookie(rawCookie) {
  // The redemption API only accepts cookie_token(_v2) + account_id(_v2)
  const fields = {}
  for (const part of rawCookie.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k && rest.length) fields[k.trim()] = rest.join('=').trim()
  }

  log('debug', 'Cookie fields found:', Object.keys(fields).join(', '))

  const cookieToken = fields['cookie_token_v2'] ?? fields['cookie_token']
  const accountId   = fields['account_id_v2']   ?? fields['account_id']

  if (!cookieToken || !accountId) return null

  const tokenKey = fields['cookie_token_v2'] ? 'cookie_token_v2' : 'cookie_token'
  const idKey    = fields['account_id_v2']   ? 'account_id_v2'   : 'account_id'

  return `${idKey}=${accountId}; ${tokenKey}=${cookieToken}`
}

async function redeemCode(game, account, code) {
  const config = redeemableGames[game]
  const internalRegion = config.regionMap[account.region]
  if (!internalRegion) {
    log('debug', `redeemCode: unknown region ${account.region} for ${game}`)
    return { success: false, message: `Unknown region: ${account.region}` }
  }

  const redemptionCookie = extractRedemptionCookie(account.cookie)
  if (!redemptionCookie) {
    return { success: false, message: 'Missing cookie_token or account_id in cookie' }
  }

  const params = new URLSearchParams({
    t: Date.now(),
    lang: 'en',
    uid: account.uid,
    region: internalRegion,
    cdkey: code,
    game_biz: config.bizKey,
  })
  if (game === 'gi') params.set('sLangKey', 'en-us')

  const url = `${config.baseUrl}?${params}`
  try {
    const res = await fetch(url, {
      method: config.method,
      headers: { 'User-Agent': USER_AGENT, Cookie: redemptionCookie },
    })
    const data = await res.json()
    log('debug', `redeemCode(${game}, ${code}):`, data)

    const retcode = data.retcode
    const alreadyRedeemed = retcode === -2001
    const invalidCode     = retcode === -2003

    return {
      success: retcode === 0,
      alreadyRedeemed,
      invalidCode,
      message: data.message ?? JSON.stringify(data),
    }
  } catch (e) {
    return { success: false, alreadyRedeemed: false, invalidCode: false, message: e.message }
  }
}

async function redeemCodesForAccount(game, account) {
  // Validate cookie before fetching codes
  const redemptionCookie = extractRedemptionCookie(account.cookie)
  if (!redemptionCookie) {
    log('error', game, 'Code redemption skipped: missing cookie_token or account_id in cookie')
    return []
  }

  const codes = await fetchActiveCodes(game)
  if (codes.length === 0) return []

  // Load persisted redeemed codes from GitHub Variables
  const allRedeemed = await loadRedeemedCodes()
  if (!allRedeemed[game]) allRedeemed[game] = new Set()

  const results = []

  for (const { code } of codes) {
    // Skip codes already saved as redeemed in persistent storage
    if (allRedeemed[game].has(code)) {
      log('debug', `Code ${code} already redeemed previously for ${game}, skipping`)
      continue
    }

    const result = await redeemCode(game, account, code)

    if (result.alreadyRedeemed) {
      // Already redeemed on account — save it so we skip it next time
      allRedeemed[game].add(code)
      log('debug', `Code ${code} already redeemed on account, saving and skipping`)
      continue
    }

    if (result.invalidCode) {
      log('debug', `Code ${code} is expired or invalid, skipping`)
      continue
    }

    if (result.success) {
      allRedeemed[game].add(code)
    }

    results.push({ code, ...result })
    log('info', game, `Code ${code}: ${result.message}`)

    // HoYoverse requires ~6s between redemptions to avoid rate limiting
    await sleep(6000)
  }

  // Save updated redeemed codes back to GitHub Variables
  await saveRedeemedCodes(allRedeemed)

  return results
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
      const alreadySigned = code === '-5003'
      log('info', game, `${successCodes[code]}`)

      // Fetch rich data for Discord embed
      if (gamesMeta[game] && discordWebhook) {
        const [account, signInfo, awards] = await Promise.all([
          getAccountDetails(cookie, game),
          getSignInfo(cookie, game),
          getAwards(cookie, game),
        ])

        if (account && signInfo && awards) {
          const totalToday = signInfo.total
          const awardIndex = Math.max(0, totalToday - 1)
          const award = awards[awardIndex]

          checkInResults.push({
            game,
            meta: gamesMeta[game],
            account,
            total: totalToday,
            alreadySigned,
            result: successCodes[code],
            award: award ? { name: award.name, count: award.cnt, icon: award.icon } : null,
          })

          // Attempt code redemption for supported games (skip if already signed today)
          if (!alreadySigned && redeemableGames[game]) {
            const codeResults = await redeemCodesForAccount(game, { ...account, cookie })
            if (codeResults.length > 0) {
              checkInResults[checkInResults.length - 1].codeResults = codeResults
            }
          }
        }
      }

      continue
    }

    // error responses
    const errorCodes = {
      '-100': 'Your cookie is invalid, try setting up again',
      '-10002': "You haven't played this game",
    }

    log('debug', game, `Headers`, Object.fromEntries(res.headers))
    log('debug', game, `Response`, json)

    const errorMessage = errorCodes[code] ?? 'Undocumented error — report to Issues page if this persists'
    log('error', game, errorMessage)

    if (gamesMeta[game] && discordWebhook) {
      errorEmbeds.push({ game, meta: gamesMeta[game], message: errorMessage })
    }
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Posts a single webhook request, respecting Discord rate limits via retry-after
async function webhookPost(payload) {
  while (true) {
    const res = await fetch(discordWebhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.status === 429) {
      const retryData = await res.json().catch(() => ({}))
      const retryAfter = (retryData.retry_after ?? 1) * 1000
      log('debug', `Discord rate limited, retrying after ${retryAfter}ms`)
      await sleep(retryAfter)
      continue
    }

    return res
  }
}

async function sendDiscordEmbed(entry) {
  // Use a muted grey for already-signed embeds, game color for fresh check-ins
  const embedColor = entry.alreadySigned ? 0x9B9B9B : entry.meta.color

  const fields = [
    { name: 'Nickname',        value: String(entry.account.nickname), inline: true },
    { name: 'UID',             value: String(entry.account.uid),      inline: true },
    { name: 'Rank',            value: String(entry.account.rank),     inline: true },
    { name: 'Region',          value: String(entry.account.region),   inline: true },
    ...(entry.award ? [{ name: "Today's Reward", value: `${entry.award.name} x${entry.award.count}`, inline: true }] : []),
    { name: 'Total Check-Ins', value: String(entry.total),            inline: true },
    { name: 'Result',          value: entry.result,                   inline: false },
  ]

  const embed = {
    color: embedColor,
    title: `${entry.meta.fullName} Daily Check-In`,
    author: {
      name: `${entry.account.uid} - ${entry.account.nickname}`,
      icon_url: entry.meta.icon,
    },
    fields,
    ...(entry.award ? { thumbnail: { url: entry.award.icon } } : {}),
    timestamp: new Date().toISOString(),
    footer: { text: `${entry.meta.fullName} Daily Check-In` },
  }

  const res = await webhookPost({
    username: entry.meta.author,
    avatar_url: entry.meta.icon,
    embeds: [embed],
  })

  if (res.status !== 204) {
    log('error', `Error sending Discord embed for ${entry.meta.fullName}`)
  }
}

async function sendCodeEmbed(entry) {
  if (!entry.codeResults?.length) return

  const codeLines = entry.codeResults.map(r =>
    `\`${r.code}\` — ${r.success ? '✅' : '❌'} ${r.message}`
  )

  const embed = {
    color: entry.meta.color,
    title: `${entry.meta.fullName} Code Redemption`,
    author: {
      name: `${entry.account.uid} - ${entry.account.nickname}`,
      icon_url: entry.meta.icon,
    },
    fields: [
      { name: 'Codes', value: codeLines.join('\n'), inline: false },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: `${entry.meta.fullName} Code Redemption` },
  }

  const res = await webhookPost({
    username: entry.meta.author,
    avatar_url: entry.meta.icon,
    embeds: [embed],
  })

  if (res.status !== 204) {
    log('error', `Error sending code embed for ${entry.meta.fullName}`)
  }
}

async function sendErrorEmbed(entry) {
  const embed = {
    color: 0xFF0000,
    title: `${entry.meta.fullName} Daily Check-In — Error`,
    description: `❌ ${entry.message}`,
    author: {
      name: entry.meta.fullName,
      icon_url: entry.meta.icon,
    },
    timestamp: new Date().toISOString(),
    footer: { text: `${entry.meta.fullName} Daily Check-In` },
  }

  const res = await webhookPost({
    username: entry.meta.author,
    avatar_url: entry.meta.icon,
    embeds: [embed],
  })

  if (res.status !== 204) {
    log('error', `Error sending Discord error embed for ${entry.meta.fullName}`)
  }
}

// must be function to return early
async function discordWebhookSend() {
  log('debug', '\n----- DISCORD WEBHOOK -----')

  if (!discordWebhook.toLowerCase().trim().startsWith('https://discord.com/api/webhooks/')) {
    log('error', 'DISCORD_WEBHOOK is not a Discord webhook URL. Must start with `https://discord.com/api/webhooks/`')
    return
  }

  // Send check-in embed followed immediately by code embed (if any) per game
  for (const entry of checkInResults) {
    await sendDiscordEmbed(entry)
    await sleep(500)

    if (entry.codeResults?.length > 0) {
      await sendCodeEmbed(entry)
      await sleep(500)
    }
  }

  // Send one error embed per failed check-in
  for (const entry of errorEmbeds) {
    await sendErrorEmbed(entry)
    await sleep(500)
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
