const mongoose = require('mongoose')
const Node = require('./models/Node')
const Edge = require('./models/Edge')

const LOCAL = 'mongodb://localhost:27017/indoornav'
const ATLAS = 'mongodb+srv://harsh:Harshyadav98@cluster0.2nkmdzf.mongodb.net/indoornav?appName=Cluster0'

async function migrate() {
  // Connect to local and fetch all data
  await mongoose.connect(LOCAL)
  const nodes = await Node.find().lean()
  const edges = await Edge.find().lean()
  console.log(`Fetched ${nodes.length} nodes, ${edges.length} edges from local`)
  await mongoose.disconnect()

  // Connect to Atlas and insert
  await mongoose.connect(ATLAS)
  await Node.deleteMany({})
  await Edge.deleteMany({})
  await Node.insertMany(nodes)
  await Edge.insertMany(edges)
  console.log('✅ Migration complete!')
  await mongoose.disconnect()
}

migrate().catch(console.error)