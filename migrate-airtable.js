require('dotenv').config()
const Airtable = require('airtable')
const prisma = require('./src/prisma')

const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN })
  .base('appUUUTLFWyBwKDAX')

async function migrate() {
  console.log('Fetching leads from Airtable...')

  const records = await base('tblOKwEP1nMmR3wwg').select().all()

  console.log(`Found ${records.length} leads. Importing...`)

  for (const record of records) {
    const fields = record.fields

    await prisma.lead.create({
      data: {
        name:        fields['Name']       || 'Unknown',
        email:       fields['Email']      || 'unknown@unknown.com',
        phone:       fields['Phone']      || 'Not provided',
        postcode:    fields['Postcode']   || 'Unknown',
        size:        fields['Size']       || 'Unknown',
        material:    fields['Material']   || 'Unknown',
        quartzStyle: fields['Quartzstyle'] || null,
        budget:      fields['Budget']     || null,
        timeline:    fields['Timeline']   || null,
        photoUrl:    fields['Photo']?.[0]?.url || null,
        status:      'New',
        userId:      1
      }
    })

    console.log(`✓ Imported: ${fields['Name']}`)
  }

  console.log('Migration complete!')
  await prisma.$disconnect()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  prisma.$disconnect()
  process.exit(1)
})