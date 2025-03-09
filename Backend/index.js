const { ApolloServer } = require('@apollo/server')
const { startStandaloneServer } = require('@apollo/server/standalone')
const { GraphQLError } = require('graphql');
const { v4 } = require('uuid')
const mongoose = require('mongoose')
mongoose.set('strictQuery', false)

const Book = require('./models/Book')
const Author = require('./models/Author')

require('dotenv').config()
const MONGODB_URI = process.env.MONGODB_URI

console.log('connecting to', MONGODB_URI)

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.log('Error connecting to MongoDB:', error.message))

const typeDefs = `
  type Mutation {
    addBook(
      title: String!
      published: Int!
      author: String!
      genres: [String!]!
    ): Book

    editAuthor(
      name: String!
      setBornTo: Int!
    ): Author
  }

  type Author {
    name: String!
    id: ID!
    born: Int
    bookCount: Int!
  }
    
  type Book {
    title: String!
    published: Int!
    author: Author!
    id: ID!
    genres: [String!]!
  }

  type Query {
    bookCount: Int!
    authorCount: Int!
    allBooks(author: String, genre: String): [Book]
    allAuthors: [Author!]!
  }
`

const resolvers = {
  Query: {
    bookCount: async () => await Book.countDocuments(),
    authorCount: async () => await Author.countDocuments(),
    
    allBooks: async (root, args) => {
      let filter = {}
      if (args.genre) filter.genres = args.genre
      if (args.author) {
        const author = await Author.findOne({ name: args.author })
        if (!author) return []
        filter.author = author._id
      }
      return await Book.find(filter).populate('author')
    },

    allAuthors: async () => {
      const authors = await Author.find({})
      return authors.map(author => ({
        ...author.toObject(),
        bookCount: Book.countDocuments({ author: author._id })
      }))
    }
  },

  Mutation: {
    addBook: async (root, args) => {
      let author = await Author.findOne({ name: args.author })
      
      if (!author) {
        author = new Author({ name: args.author })
        await author.save()
      }

      const book = new Book({
        ...args,
        author: author._id
      })
      try {
        await book.save() 
      } catch (error) {
        throw new GraphQLError('Saving person failed', {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.name,
            error
          }
        })
      }
      
      return book.populate('author')
    },

    editAuthor: async (root, args) => {
      const author = await Author.findOneAndUpdate(
        { name: args.name },
        { born: args.setBornTo },
        { new: true }
      )
      return author
    }
  }
}

const server = new ApolloServer({ typeDefs, resolvers })

startStandaloneServer(server, { listen: { port: 4000 } })
  .then(({ url }) => console.log(`Server ready at ${url}`))
