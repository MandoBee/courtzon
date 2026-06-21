import { cmsRepository } from '../infrastructure/repositories/cms.repository.js';

export const cmsService = {
  // Pages
  async listPages() { return cmsRepository.listPages(); },
  async reorderPages(pageIds: number[]) { await cmsRepository.reorderPages(pageIds); },
  async getPage(id: number) { return cmsRepository.getPage(id); },
  async getPublishedSlugs() { return cmsRepository.getPublishedSlugs(); },
  async getPageBySlug(slug: string) { return cmsRepository.getPageBySlug(slug); },
  async getHomePage() { return cmsRepository.getHomePage(); },
  async createPage(data: any, userId: number) { const id = await cmsRepository.createPage(data, userId); return cmsRepository.getPage(id); },
  async updatePage(id: number, data: any) { await cmsRepository.updatePage(id, data); return cmsRepository.getPage(id); },
  async deletePage(id: number) { return cmsRepository.deletePage(id); },
  async publishPage(id: number, publish: boolean) { await cmsRepository.publishPage(id, publish); return cmsRepository.getPage(id); },

  // Blocks
  async listBlocks(pageId: number) { return cmsRepository.listBlocks(pageId); },
  async createBlock(data: any) { const id = await cmsRepository.createBlock(data); return { id, ...data }; },
  async updateBlock(id: number, data: any) { await cmsRepository.updateBlock(id, data); },
  async deleteBlock(id: number) { await cmsRepository.deleteBlock(id); },
  async reorderBlocks(pageId: number, blockIds: number[]) { await cmsRepository.reorderBlocks(pageId, blockIds); },

  // Blogs
  async listBlogs(publishedOnly = false) { return cmsRepository.listBlogs(publishedOnly); },
  async getBlog(id: number) { return cmsRepository.getBlog(id); },
  async createBlog(data: any, userId: number) { const id = await cmsRepository.createBlog(data, userId); return cmsRepository.getBlog(id); },
  async updateBlog(id: number, data: any) { await cmsRepository.updateBlog(id, data); return cmsRepository.getBlog(id); },
  async deleteBlog(id: number) { return cmsRepository.deleteBlog(id); },
  async publishBlog(id: number, publish: boolean) { await cmsRepository.publishBlog(id, publish); return cmsRepository.getBlog(id); },

  // Sections
  async createSection(data: any) { const id = await cmsRepository.createSection(data); return { id, ...data }; },
  async updateSection(id: number, data: any) { await cmsRepository.updateSection(id, data); },
  async deleteSection(id: number) { return cmsRepository.deleteSection(id); },

  // Media
  async listMedia(mediaType?: string, category?: string) { return cmsRepository.listMedia(mediaType, category); },
  async createMedia(data: any) { const id = await cmsRepository.createMedia(data); return { id, ...data }; },
  async deleteMedia(id: number) { await cmsRepository.deleteMedia(id); },

  // Contact
  async listContactSubmissions() { return cmsRepository.listContactSubmissions(); },
  async markContactRead(id: number) { await cmsRepository.markContactRead(id); },
};
