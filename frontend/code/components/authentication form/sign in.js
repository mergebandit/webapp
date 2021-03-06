import React, { Component, PropTypes } from 'react'
import { connect } from 'react-redux'
import { flat as style } from 'react-styling'
import { defineMessages, FormattedMessage } from 'react-intl'
import { Form, Button } from 'react-responsive-ui'
import Redux_form from 'simpler-redux-form'

import Submit     from '../form/submit'
import Text_input from '../form/text input'
import User       from '../user'
import Time_ago   from '../time ago'

import http_status_codes from '../../tools/http status codes'
import international from '../../international/internationalize'
import { messages as user_bar_messages } from '../user bar'

import
{
	sign_in,
	reset_sign_in_error,
	connector
}
from '../../redux/authentication'

@Redux_form
@connect
(
	state =>
	({
		...connector(state.authentication)
	}),
	{
		sign_in,
		reset_sign_in_error
	}
)
@international
export default class Sign_in extends Component
{
	constructor()
	{
		super()

		this.sign_in        = this.sign_in.bind(this)
		this.validate_email = this.validate_email.bind(this)
	}

	render()
	{
		const
		{
			translate,
			sign_in_error,
			reset_sign_in_error,
			submit,
			submitting
		}
		= this.props

		const markup =
		(
			<Form
				className="authentication-form"
				action={ submit(reset_sign_in_error, this.sign_in) }
				busy={ submitting }
				error={ this.sign_in_error(sign_in_error) }
				post="/users/legacy/sign-in">

				{/* "Sign in" */}
				<h2 style={ styles.form_title }>
					{ translate(user_bar_messages.sign_in) }
				</h2>

				<div className="rrui__form__fields">
					{/* "Email" */}
					<Text_input
						email
						name="email"
						validate={ this.validate_email }
						label={ translate(messages.email) }/>
				</div>

				<Form.Error/>

				{/* Unblock user instructions */}
				{ sign_in_error && sign_in_error.status === http_status_codes.Access_denied &&
					unblock_message
				}

				<Form.Actions className="rrui__form__actions--right">
					{/* "Sign in" button */}
					<Submit>
						{ translate(user_bar_messages.sign_in) }
					</Submit>
				</Form.Actions>
			</Form>
		)

		return markup
	}

	async sign_in(fields)
	{
		const
		{
			sign_in,
			start_registration
		}
		= this.props

		try
		{
			await sign_in
			({
				email : fields.email
			})
		}
		catch (error)
		{
			if (error.status === http_status_codes.Not_found)
			{
				return start_registration(fields.email)
			}

			console.error(error)
		}
	}

	sign_in_error(error)
	{
		const { translate } = this.props

		if (!error)
		{
			return
		}

		if (error.field === 'email')
		{
			return
		}

		if (error.message === 'Access code attempts limit exceeded')
		{
			return translate(messages.login_attempts_limit_exceeded_error)
		}

		if (error.status === http_status_codes.Access_denied)
		{
			let details_parameters =
			{
				blocked_at : <Time_ago>{ error.blocked_at }</Time_ago>
			}

			if (error.self_block)
			{
				const parameters =
				{
					details : <span className="form__error-details">
						<FormattedMessage
							{ ...messages.user_is_self_blocked_details }
							values={ details_parameters }/>
					</span>
				}

				return <FormattedMessage
					{ ...messages.user_is_self_blocked }
					values={ parameters }/>
			}

			details_parameters =
			{
				...details_parameters,
				blocked_by     : <User>{ error.blocked_by }</User>,
				blocked_reason : error.blocked_reason
			}

			const parameters =
			{
				details : <span className="form__error-details">
					<FormattedMessage
						{ ...messages.user_is_blocked_details }
						values={ details_parameters }/>
				</span>
			}

			return <FormattedMessage
				{ ...messages.user_is_blocked }
				values={ parameters }/>
		}

		return translate(messages.sign_in_error)
	}

	validate_email(value)
	{
		if (!value)
		{
			return this.props.translate(messages.authentication_email_is_required)
		}
	}
}

const styles = style
`
	form_title
		margin : 0
`

export const messages = defineMessages
({
	email:
	{
		id             : 'authentication.email',
		description    : 'Email',
		defaultMessage : 'Email'
	},
	authentication_email_is_required:
	{
		id             : 'authentication.error.email.is_required',
		description    : 'Email field value can\'t be empty',
		defaultMessage : 'Enter your email address'
	},
	user_is_self_blocked:
	{
		id             : 'authentication.error.user_is_self_blocked',
		description    : 'A note that this user has opted into temporarily blocking his own account for safety concerns',
		defaultMessage : `You willingly temporarily blocked your account {details}`
	},
	user_is_self_blocked_details:
	{
		id             : 'authentication.error.user_is_self_blocked_details',
		description    : 'Date when this user has opted into temporarily blocking his own account for safety concerns',
		defaultMessage : `{blocked_at}`
	},
	user_is_blocked:
	{
		id             : 'authentication.error.user_is_blocked',
		description    : 'A note that this user is blocked',
		defaultMessage : `Your account was blocked {details}`
	},
	user_is_blocked_details:
	{
		id             : 'authentication.error.user_is_blocked_details',
		description    : 'A date when this user was blocked along with the details',
		defaultMessage : `{blocked_at} by {blocked_by} with reason: "{blocked_reason}"`
	},
	unblock_instructions:
	{
		id             : 'authentication.unblock_instructions',
		description    : 'Instructions on unblocking this blocked user',
		defaultMessage : `To request unblocking your account you can contact support by email: {support_email}`
	},
	sign_in_error:
	{
		id             : 'authentication.error',
		description    : 'User sign in error',
		defaultMessage : 'Couldn\'t sign in'
	},
	login_attempts_limit_exceeded_error:
	{
		id             : 'authentication.login_attempts_limit_exceeded_error',
		description    : `The user's login attempts limit has been reached. The user shold try again in 15 minutes or so.`,
		defaultMessage : 'Login attempts limit exceeded. Try again later.'
	}
})

// This React element is constant and doesn't change
// so moving it out of `render()` as a minor optimization.
const unblock_message = <FormattedMessage
	{ ...messages.unblock_instructions }
	values={ {
		support_email: <a href={ `mailto:${configuration.support.email}` }>{ configuration.support.email }</a>
	} }
	tagName="p"/>