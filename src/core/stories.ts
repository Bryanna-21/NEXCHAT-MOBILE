import AsyncStorage from "@react-native-async-storage/async-storage";

export type StoryType = "image" | "video" | "text";

export type StoryAudience =
  | "everyone"
  | "contacts"
  | "selected";

export type Story = {
  id: string;
  ownerId: string;
  createdAt: string;
  expiresAt: string;
  type: StoryType;
  uri?: string;
  text?: string;
  caption?: string;
  background?: string;
  viewed: boolean;

  /*
   * Story visibility is stored per story so each story can have
   * its own audience.
   */
  audience?: StoryAudience;
  allowedViewerIds?: string[];
};

const STORIES_KEY = "nexchat.stories.v1";
const DAY_MS = 24 * 60 * 60 * 1000;

export function createStoryId(): string {
  return `story-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function createStory(
  ownerId: string,
  data: Omit<
    Story,
    "id" | "ownerId" | "createdAt" | "expiresAt" | "viewed"
  >
): Story {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + DAY_MS);

  return {
    id: createStoryId(),
    ownerId,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    viewed: false,
    ...data,
  };
}

export async function getStories(): Promise<Story[]> {
  const raw = await AsyncStorage.getItem(STORIES_KEY);

  if (!raw) {
    return [];
  }

  try {
    const stories = JSON.parse(raw) as Story[];
    const now = Date.now();

    return stories.filter(
      (story) => new Date(story.expiresAt).getTime() > now
    );
  } catch {
    throw new Error("NexChat stories data is corrupted.");
  }
}

export async function saveStories(stories: Story[]): Promise<void> {
  await AsyncStorage.setItem(STORIES_KEY, JSON.stringify(stories));
}

export async function addStory(story: Story): Promise<void> {
  const stories = await getStories();
  await saveStories([...stories, story]);
}

export async function markStoryViewed(storyId: string): Promise<void> {
  const stories = await getStories();

  await saveStories(
    stories.map((story) =>
      story.id === storyId
        ? {
            ...story,
            viewed: true,
          }
        : story
    )
  );
}

export async function updateStory(
  storyId: string,
  changes: Partial<Pick<Story, "caption">>,
): Promise<Story | null> {
  const stories = await getStories();
  let updatedStory: Story | null = null;

  const updatedStories = stories.map((story) => {
    if (story.id !== storyId) {
      return story;
    }

    updatedStory = {
      ...story,
      ...changes,
    };

    return updatedStory;
  });

  if (!updatedStory) {
    return null;
  }

  await saveStories(updatedStories);
  return updatedStory;
}

export async function getStoriesForUser(
  ownerId: string,
  viewerId?: string,
  viewerContactIds: string[] = [],
): Promise<Story[]> {
  const stories = await getStories();

  return stories
    .filter((story) => story.ownerId === ownerId)
    .filter((story) => {
      // The owner can always see their own stories.
      if (viewerId && story.ownerId === viewerId) {
        return true;
      }

      // Older stories without an audience remain public.
      const audience = story.audience || "everyone";

      if (audience === "everyone") {
        return true;
      }

      if (!viewerId) {
        return false;
      }

      // Contacts and selected audiences are snapshotted
      // when the story is created.
      if (
        audience === "contacts" ||
        audience === "selected"
      ) {
        return Boolean(
          story.allowedViewerIds?.includes(viewerId),
        );
      }

      return false;
    })
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() -
        new Date(b.createdAt).getTime()
    );
}

export async function hasUnviewedStories(
  ownerId: string
): Promise<boolean> {
  const stories = await getStoriesForUser(ownerId);

  return stories.some((story) => !story.viewed);
}

export async function removeExpiredStories(): Promise<void> {
  const stories = await getStories();
  await saveStories(stories);
}
