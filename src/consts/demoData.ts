import { eq, or } from 'drizzle-orm'
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import * as schema from '../sqlite/schema'
const { users, posts } = schema
interface DemoUser {
	name: string
	email: string
	picture?: string
	bio?: string
	location?: string
	isActive?: boolean
}

interface DemoPost {
	authorEmail: string
	title: string
	body: string
}

const demoUsers: DemoUser[] = [
	{
		name: 'Alice Johnson',
		email: 'alice.johnson@example.com',
		bio: 'Coffee addict ☕, bookworm 📚, and occasional runner 🏃‍♀️.',
		location: 'Tel Aviv, Israel'
	},
	{
		name: 'Bob Smith',
		email: 'bob.smith@example.com',
		bio: 'Full-stack dev by day, vinyl collector by night.',
		location: 'Jerusalem, Israel'
	},
	{
		name: 'Claire Lee',
		email: 'claire.lee@example.com',
		bio: 'Designer. Traveler. Dreamer.',
		location: 'Haifa, Israel'
	},
	{
		name: 'David Kim',
		email: 'david.kim@example.com',
		bio: 'Photographer capturing life’s unscripted moments.',
		location: 'Beersheba, Israel'
	},
	{
		name: 'Ethan Patel',
		email: 'ethan.patel@example.com',
		bio: 'Tech enthusiast, amateur chef, occasional coder.',
		location: 'Eilat, Israel'
	}
]

const demoPosts: DemoPost[] = [
	{
		authorEmail: 'alice.johnson@example.com',
		title: 'My First Post',
		body: 'Hello world! This is my very first post on this platform. Excited to be here!'
	},
	{
		authorEmail: 'alice.johnson@example.com',
		title: 'Coffee Recommendations',
		body: 'Just tried a new roast from a local café in Tel Aviv. Highly recommend the “Midnight Blend.”'
	},
	{
		authorEmail: 'bob.smith@example.com',
		title: 'Node.js vs Deno',
		body: 'Let’s talk about why Deno might be the future, but Node.js isn’t going anywhere anytime soon.'
	},
	{
		authorEmail: 'bob.smith@example.com',
		title: 'Vinyl Collection Update',
		body: 'Picked up a rare pressing of Pink Floyd’s “Wish You Were Here.” The sound is immaculate!'
	},
	{
		authorEmail: 'claire.lee@example.com',
		title: 'Design Trends 2025',
		body: 'Minimalism is evolving. This year it’s all about micro-interactions and responsive typography.'
	},
	{
		authorEmail: 'david.kim@example.com',
		title: 'Sunset Photography Tips',
		body: 'Golden hour is fleeting—know your angles, fiddle with exposure, and let the colors pop.'
	},
	{
		authorEmail: 'david.kim@example.com',
		title: 'Street Photography in Haifa',
		body: 'The alleys near the German Colony offer some of the most candid shots you’ll ever capture.'
	},
	{
		authorEmail: 'ethan.patel@example.com',
		title: 'Homemade Pasta Recipe',
		body: 'It’s easier than you think. Just flour, eggs, and a bit of elbow grease. Buon appetito!'
	},
	{
		authorEmail: 'ethan.patel@example.com',
		title: 'Why React Still Rules',
		body: 'Hooks, concurrent features, a massive ecosystem—React’s not going anywhere. Here’s why.'
	}
]
export function getRandomRobot(index: number): string {
	const imageNumber = index % 7
	return `/robots/${imageNumber}.png`
}
export async function seedDemoData(db: SqliteRemoteDatabase<typeof schema>) {
	await db.insert(users).values(
		demoUsers.map(u => ({
			name: u.name,
			email: u.email,
			picture: getRandomRobot(demoUsers.indexOf(u) + 1),
			bio: u.bio,
			location: u.location,
			isActive: Math.random() < 0.5
		}))
	)

	const insertedUsers = await db
		.select({ id: users.id, email: users.email })
		.from(users)
		.where(eq(users.isActive, users.isActive))
		.all()

	const emailToIdMap: Record<string, number> = {}
	insertedUsers.forEach((row: { email: string | number; id: number }) => {
		emailToIdMap[row.email] = row.id
	})

	const postsToInsert = demoPosts.map(p => {
		const authorId = emailToIdMap[p.authorEmail]
		if (!authorId) {
			throw new Error(`No user found for email ${p.authorEmail}`)
		}
		return {
			authorId,
			title: p.title,
			body: p.body
		}
	})

	await db.insert(posts).values(postsToInsert)
}
export async function runBatchExample(db: SqliteRemoteDatabase<typeof schema>) {
	const ts = Date.now()
	const name1 = `UserA-${ts}`
	const name2 = `UserB-${ts}`
	const deleteId = 1
	const updateId = 2

	const batchResponse = await db.batch([
		db.insert(users).values({
			id: deleteId,
			name: name1,
			email: `${name1}@example.com`
		}),
		db.insert(users).values({
			id: updateId,
			name: name2,
			email: `${name2}@example.com`
		}),

		db
			.update(users)
			.set({ name: `Updated-${name2}` })
			.where(eq(users.id, updateId)),

		db.delete(users).where(eq(users.id, deleteId)),

		db.select().from(users)
	])

	return batchResponse
}
