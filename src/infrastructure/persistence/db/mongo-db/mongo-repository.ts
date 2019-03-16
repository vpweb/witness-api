import { classToPlain, plainToClass } from 'class-transformer';

import { Collection, ObjectID } from 'mongodb';
import { Repository } from '../../../../domain/repository';
import { MongoDbContext } from './mongo-db-context';
import { EntityDocument } from './entity-document';
import { METADATA_KEY, Type } from '../../../../infrastructure/framework/types';

export class MongoRepository<T extends EntityDocument> implements Repository<T> {

  private collectionName: string;
  private entityType: Type<T>;

  constructor(
    public dbContext: MongoDbContext
  ) {
    const { collectionName, entityType } = Reflect.getMetadata(METADATA_KEY.repository, this['constructor']);
    this.collectionName = collectionName;
    this.entityType = entityType;
  }

  async save(entity: T) {
    const collection = await this.collection;
    const id = new ObjectID(entity.id);

    delete entity.id;
    delete entity._id;

    await collection.updateOne(
      { _id: id },
      { $set: classToPlain(entity) },
      { upsert: true }
    );

    const newDocument = await collection.findOne({ _id: id });

    if (newDocument) {
      Object.assign(entity, newDocument);
    }

    newDocument.id = id.toString();
    delete newDocument._id;

    return plainToClass(this.entityType, newDocument);
  }

  async find(conditions: object) {
    const collection = await this.collection;
    const cursor = collection.find(conditions);
    const results = (await cursor.toArray())
      .map(document => this.toggleDocumentId(document))
      .map(document => plainToClass(this.entityType, document));

    return results;
  }

  async findOne(conditions: object) {
    const collection = await this.collection;
    const cursor = collection
      .find(conditions)
      .limit(1);

    const res = await cursor.toArray();
    if (res && res.length) {
      const document = this.toggleDocumentId(res[0]);
      return plainToClass(this.entityType, document);
    }
  }

  async findById(id: string) {
    return this.findOne({ _id: id });
  }

  async deleteById(id: string) {
    throw new Error('Method not implemented.');
  }

  private toggleDocumentId(document: any, replace = false): T {
    if (!document || !(document.id || document._id)) {
      return;
    }
    if (replace) {
      document._id = new ObjectID(document.id);
      delete document.id;
    } else {
      document.id = document._id.toString();
      delete document._id;
    }
    return document;
  }

  private get collection(): Promise<Collection<T>> {
    return new Promise<Collection<T>>(async (resolve, reject) => {
      const db = await this.dbContext.db;
      db.collection(this.collectionName, { strict: true }, async (err, collection) => {
        let ourCollection = collection;

        if (!err) {
          resolve(ourCollection);
        }

        try {
          ourCollection = await db.createCollection(this.collectionName);
        } catch (createErr) {
          reject(createErr);
        }
      });
    });
  }
}
