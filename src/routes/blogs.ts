import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

export const blogsRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function toApiFormat(post: {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  title: string;
  slug: string;
  description: string;
  content: string;
  imageUrl: string;
  tags: string;
  status: string;
  publishedAt: Date | null;
}) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    description: post.description,
    content: post.content,
    imageUrl: post.imageUrl,
    tags: JSON.parse(post.tags) as string[],
    status: post.status as 'draft' | 'published',
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  let counter = 2;
  for (;;) {
    const existing = await prisma.blogPost.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${counter}`;
    counter++;
  }
}

// ── Public routes (no auth) ───────────────────────────────────────────────────

// GET /blogs/public — all published posts
blogsRouter.get('/public', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { status: 'published' },
      orderBy: { publishedAt: 'desc' },
    });
    res.json(posts.map(toApiFormat));
  } catch (err) {
    next(err);
  }
});

// GET /blogs/slug/:slug — single post by slug
blogsRouter.get('/slug/:slug', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const post = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    res.json(toApiFormat(post));
  } catch (err) {
    next(err);
  }
});

// ── Admin routes (requireAuth) ────────────────────────────────────────────────

// GET /blogs — list all posts, optional ?status=draft|published
blogsRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const where = status === 'draft' || status === 'published' ? { status } : undefined;
    const posts = await prisma.blogPost.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(posts.map(toApiFormat));
  } catch (err) {
    next(err);
  }
});

// POST /blogs — create
blogsRouter.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { title, description, content, imageUrl, tags, status } = req.body as {
      title?: string;
      description?: string;
      content?: string;
      imageUrl?: string;
      tags?: string[];
      status?: string;
    };

    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const baseSlug = generateSlug(title);
    const slug = await uniqueSlug(baseSlug);
    const resolvedStatus = status === 'published' ? 'published' : 'draft';

    const post = await prisma.blogPost.create({
      data: {
        title,
        slug,
        description: description ?? '',
        content: content ?? '',
        imageUrl: imageUrl ?? '',
        tags: JSON.stringify(Array.isArray(tags) ? tags : []),
        status: resolvedStatus,
        publishedAt: resolvedStatus === 'published' ? new Date() : null,
      },
    });

    res.status(201).json(toApiFormat(post));
  } catch (err) {
    next(err);
  }
});

// GET /blogs/:id — single post by id
blogsRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const post = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    res.json(toApiFormat(post));
  } catch (err) {
    next(err);
  }
});

// PUT /blogs/:id — full update
blogsRouter.put('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.blogPost.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    const { title, slug: rawSlug, description, content, imageUrl, tags, status, publishedAt } =
      req.body as {
        title?: string;
        slug?: string;
        description?: string;
        content?: string;
        imageUrl?: string;
        tags?: string[];
        status?: string;
        publishedAt?: string | null;
      };

    let slug = existing.slug;
    if (rawSlug && rawSlug !== existing.slug) {
      slug = await uniqueSlug(generateSlug(rawSlug), id);
    } else if (title && title !== existing.title && !rawSlug) {
      slug = await uniqueSlug(generateSlug(title), id);
    }

    const resolvedStatus = status === 'published' || status === 'draft' ? status : existing.status;
    let resolvedPublishedAt = existing.publishedAt;
    if (resolvedStatus === 'published' && !existing.publishedAt) {
      resolvedPublishedAt = new Date();
    } else if (publishedAt !== undefined) {
      resolvedPublishedAt = publishedAt ? new Date(publishedAt) : null;
    }

    const post = await prisma.blogPost.update({
      where: { id },
      data: {
        title: title ?? existing.title,
        slug,
        description: description ?? existing.description,
        content: content ?? existing.content,
        imageUrl: imageUrl ?? existing.imageUrl,
        tags: Array.isArray(tags) ? JSON.stringify(tags) : existing.tags,
        status: resolvedStatus,
        publishedAt: resolvedPublishedAt,
      },
    });

    res.json(toApiFormat(post));
  } catch (err) {
    next(err);
  }
});

// DELETE /blogs/:id
blogsRouter.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const existing = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    await prisma.blogPost.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// PATCH /blogs/:id/status
blogsRouter.patch('/:id/status', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status } = req.body as { status?: string };
    if (status !== 'draft' && status !== 'published') {
      res.status(400).json({ error: 'status must be "draft" or "published"' });
      return;
    }

    const existing = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    const publishedAt =
      status === 'published' && !existing.publishedAt ? new Date() : existing.publishedAt;

    const post = await prisma.blogPost.update({
      where: { id: req.params.id },
      data: { status, publishedAt },
    });

    res.json(toApiFormat(post));
  } catch (err) {
    next(err);
  }
});
