const { ApolloServer } = require('@apollo/server')
const { startStandaloneServer } = require('@apollo/server/standalone')
const { GraphQLError } = require('graphql');
const { v4 } = require('uuid')
const mongoose = require('mongoose')
mongoose.set('strictQuery', false)

const Book = require('./models/Book')
const Author = require('./models/Author')
const User = require('./models/User')
const jwt = require('jsonwebtoken')


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
    
    createUser(
    username: String!
    favouriteGenre: String!
  ): User

  login(
    username: String!
    password: String!
  ): Token
  }

  type User {
  username: String!
  favouriteGenre: String!
  id: ID!
  }

  type Token {
    value: String!
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
    me: User
    authorCount: Int!
    allBooks(author: String, genre: String): [Book]
    allAuthors: [Author!]!
  }
`

const resolvers = {
  Query: {
    bookCount: async () => await Book.countDocuments(),
    authorCount: async () => await Author.countDocuments(),
    me: (root, args, context) => {
      return context.currentUser
    },
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
    },

    createUser: async (root, args) => {
      const user = new User({ username: args.username , favouriteGenre: args.favouriteGenre})
  
      return user.save()
        .catch(error => {
          throw new GraphQLError('Creating the user failed', {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.username,
              error
            }
          })
        })
    },

    login: async (root, args) => {
      const user = await User.findOne({ username: args.username })
  
      if ( !user || args.password !== 'secret' ) {   // the objective here to learn graphQL ,so slacked off with password
        throw new GraphQLError('wrong credentials', {
          extensions: {
            code: 'BAD_USER_INPUT'
          }
        })        
      }
  
      const userForToken = {
        username: user.username,
        favouriteGenre: user.favouriteGenre,
        id: user._id,
      }
  
      return { value: jwt.sign(userForToken, "someSecret") }  //slacked off for the sake of learning.
    },
  }
}

const server = new ApolloServer({ typeDefs, resolvers })

startStandaloneServer(server, {
  listen: { port: 4000 },

  context: async ({ req, res }) => {
    const auth = req ? req.headers.authorization : null
    if (auth && auth.startsWith('Bearer ')) {
      const decodedToken = jwt.verify(
        auth.substring(7), "someSecret"
      )
      const currentUser = await User
        .findById(decodedToken.id)
      return { currentUser }
    }
  },
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})
