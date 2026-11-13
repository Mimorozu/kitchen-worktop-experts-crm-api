// WhatsApp alerts for new leads, sent through the Meta WhatsApp Business Cloud API.
// Business-initiated messages must use an approved template. Without the configuration variables,
// alerts are skipped and logged. A failed alert is logged and never blocks saving the lead.
//
// Variables: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ALERT_TO (your number, digits with country code),
// optional WHATSAPP_TEMPLATE (default "new_lead_alert") and WHATSAPP_LANGUAGE (default "en_GB").

const GRAPH_VERSION = 'v21.0'
const MAX_PARAM_LENGTH = 60

// Template parameters cannot contain line breaks, and long values are cut so the template stays readable
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_PARAM_LENGTH) || '-'

const configured = () =>
  Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ALERT_TO)

// Sends one alert about a new lead. Resolves once the request finishes; throws if Meta rejects it.
const sendLeadAlert = async (lead) => {
  if (!configured()) {
    console.log('[whatsapp] alert skipped: WhatsApp variables are not set')
    return
  }

  const body = {
    messaging_product: 'whatsapp',
    to: process.env.WHATSAPP_ALERT_TO,
    type: 'template',
    template: {
      name: process.env.WHATSAPP_TEMPLATE || 'new_lead_alert',
      language: { code: process.env.WHATSAPP_LANGUAGE || 'en_GB' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: clean(lead.name) },
          { type: 'text', text: clean(lead.phone) },
          { type: 'text', text: clean(lead.postcode) },
          { type: 'text', text: clean(lead.material) }
        ]
      }]
    }
  }

  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) throw new Error(`WhatsApp returned ${response.status}`)
}

// Fire-and-forget wrapper used by the route: the lead is already saved, so errors are only logged
const notifyNewLead = (lead) => {
  sendLeadAlert(lead).catch((error) => console.error(`[whatsapp] alert failed for lead ${lead.id}: ${error.message}`))
}

module.exports = { sendLeadAlert, notifyNewLead, clean }
