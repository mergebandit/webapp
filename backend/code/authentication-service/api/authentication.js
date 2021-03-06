import set_seconds from 'date-fns/set_seconds'
import { http, errors, jwt } from 'web-service'

import store               from '../store/store'
import online_status_store from '../store/online/online store'
import Throttling          from '../../common/throttling'

const throttling = new Throttling
({
	succeeded : store.clear_latest_failed_authentication_attempt.bind(store),
	failed    : store.set_latest_failed_authentication_attempt.bind(store)
},
'Access code attempts limit exceeded')

const latest_activity_time_refresh_interval = 60 * 1000 // one minute

export default function(api)
{
	// Issues a new access token for this user
	api.post('/token', async function({ user, access_code }, { ip, keys })
	{
		// Verify the access code
		const user_id = await http.get(`${address_book.access_code_service}/verify`, access_code)

		if (!user_id)
		{
			throw new errors.Access_denied('Wrong access code', { field: 'access_code' })
		}

		// // Check the password
		// if (!await check_password(user.id, user.password))
		// {
		// 	throw new errors.Input_rejected(`Wrong password`, { field: 'password' })
		// }

		// Add a new JWT token to the list of valid tokens for this user
		const jwt_id = await store.add_authentication_token(user.id, ip)

		// Generate real JWT token payload
		const payload = configuration.authentication_token_payload.write(user)

		// Issue JWT token
		return jwt({ payload, keys, user_id: user.id, jwt_id })
	})

	api.get('/tokens', async function({}, { user, authentication_token_id })
	{
		if (!user)
		{
			throw new errors.Unauthenticated()
		}

		const tokens = await store.get_tokens(user.id)

		// Mark the currently used token
		for (let token of tokens)
		{
			if (token.id === authentication_token_id)
			{
				token.currently_used = true
			}
		}

		return tokens
	})

	api.get('/token/valid', async function({ bot }, { ip, authentication_token_id, user, internal_http })
	{
		// The user will be populated inside `common/web server`
		// out of the token data if the token is valid.
		// (only for `/token/valid` http get requests)
		//
		// If the user isn't populated from the token data
		// then it means that token data is corrupt.
		// (token data is encrypted and in this case decryption fails)
		//
		if (!user)
		{
			return { valid: false }
		}

		// Token data is valid.
		// The next step is to check that the token hasn't been revoked.

		// Try to get token validity status from cache
		const is_valid = await online_status_store.check_access_token_validity(user.id, authentication_token_id)

		// If such a key exists in Redis, then the token is valid.
		// Else, query the database for token validity
		if (!is_valid)
		{
			const token = await store.find_token_by_id(authentication_token_id)

			const valid = token && !token.revoked_at

			// Cache access token validity.
			//
			// Theoretically there could be a small race condition here,
			// when a token validity is not cached, and that token is revoked
			// between the token validity being read from the database
			// and the token validition being cached, but I assume exploitability
			// of this race condition practically equal to zero.
			//
			await online_status_store.set_access_token_validity(user.id, authentication_token_id, valid)

			if (!valid)
			{
				return { valid }
			}
		}

		// If it's not an automated Http request,
		// then update this authentication token's last access IP and time
		if (!bot)
		{
			record_access(user.id, authentication_token_id, ip, internal_http)
		}

		// The token is considered valid
		return { valid: true }
	})

	api.post('/token/:id/revoke', async function({ id, block_user_token_id }, { user, authentication_token_id })
	{
		// Special case for "revoke all tokens".
		// (e.g. when blocking a user)
		if (id === '*')
		{
			if (!block_user_token_id)
			{
				throw new errors.Input_rejected(`"block_user_token_id" is required`)
			}

			const block_user_token = await http.get(`${address_book.user_service}/block-user-token/${block_user_token_id}`)

			if (!block_user_token)
			{
				throw new errors.Not_found('Block user token not found')
			}

			for (let token of await store.get_all_valid_tokens(block_user_token.user.id))
			{
				await revoke_token(token.id, block_user_token.user.id)
			}

			return
		}

		if (!user)
		{
			throw new errors.Unauthenticated()
		}

		if (id === 'current')
		{
			id = authentication_token_id
		}

		await revoke_token(id, user.id)
	})

	api.get('/latest-recent-activity/:id', async function({ id })
	{
		return await online_status_store.get_latest_access_time(id)
	})
}

async function revoke_token(id, revoking_user_id)
{
	const token = await store.find_token_by_id(id)

	if (!token)
	{
		throw new errors.Not_found()
	}

	if (token.user !== revoking_user_id)
	{
		throw new errors.Unauthorized()
	}

	await store.revoke_token(id)
	await online_status_store.clear_access_token_validity(token.user, id)
}

async function record_access(user_id, authentication_token_id, ip, internal_http)
{
	try
	{
		const now = Date.now()

		// Update latest access time: both for this (token, IP) pair and for the user
		await online_status_store.update_latest_access_time(user_id, authentication_token_id, ip, now)

		// When was the last time it was persisted to the database for this (token, IP) pair
		const persisted_at = await online_status_store.get_latest_access_time_persisted_at(authentication_token_id, ip)

		// If enough time has passed to update the persisted latest activity time
		// for this (token, IP) pair, then do it.
		if (!persisted_at || now - persisted_at >= latest_activity_time_refresh_interval)
		{
			// Update the time it was persisted to the database for this (token, IP) pair
			await online_status_store.set_latest_access_time_persisted_at(authentication_token_id, ip, now)

			// Fuzzy latest access time
			const was_online_at = round_user_access_time(now)

			// Update latest access time for this (token, IP) pair
			await store.record_access(user_id, authentication_token_id, ip, was_online_at)

			// Also update the redundant `was_online_at` field in the `users` table
			await internal_http.post(`${address_book.user_service}/was-online-at`, { date: was_online_at })
		}
	}
	catch (error)
	{
		log.error(error)
		throw error
	}
}

// user's latest activity time accuracy
function round_user_access_time(time)
{
	return set_seconds(time, 0)
}