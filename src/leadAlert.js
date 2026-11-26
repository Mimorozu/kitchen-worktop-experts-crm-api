// Emails the team when a new lead is created, through the same Resend mailer as the auth emails.
// Set LEAD_ALERT_EMAIL to the recipient. Without it, no alert is sent.
// A failed alert is logged and never blocks saving the lead.

const { sendMail } = require('./mailer')

// Strips line breaks so a value cannot inject extra lines into the email body
const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim() || '-'

const sendLeadAlert = async (lead) => {
  const to = process.env.LEAD_ALERT_EMAIL
  if (!to) return

  const text = [
    'A new lead has come in.',
    '',
    `Name: ${oneLine(lead.name)}`,
    `Phone: ${oneLine(lead.phone)}`,
    `Email: ${oneLine(lead.email)}`,
    `Postcode: ${oneLine(lead.postcode)}`,
    `Material: ${oneLine(lead.material)}`,
    `Size: ${oneLine(lead.size)}`,
    `Source: ${oneLine(lead.source)}`,
    '',
    `Lead ID: ${lead.id}`
  ].join('\n')

  await sendMail({ to, subject: `New lead: ${oneLine(lead.name)}`, text })
}

// Fire-and-forget wrapper used by the route: the lead is already saved, so errors are only logged
const notifyNewLead = (lead) => {
  sendLeadAlert(lead).catch((error) => console.error(`[lead-alert] failed for lead ${lead.id}: ${error.message}`))
}

module.exports = { sendLeadAlert, notifyNewLead }
