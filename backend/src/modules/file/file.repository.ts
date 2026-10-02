import { FileModel, type FileDoc } from './file.model.js'

export const fileRepository = {
  create: async (doc: Omit<FileDoc, 'createdAt'>): Promise<FileDoc> => (await new FileModel(doc).save()).toObject(),
  findById: (id: string): Promise<FileDoc | null> => FileModel.findById(id).lean(),
}
