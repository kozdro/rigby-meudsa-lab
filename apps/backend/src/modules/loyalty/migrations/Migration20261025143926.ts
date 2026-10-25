import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261025143926 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "loyalty_redemption" drop constraint if exists "loyalty_redemption_promotion_id_unique";`);
    this.addSql(`alter table if exists "loyalty_redemption" drop constraint if exists "loyalty_redemption_cart_id_unique";`);
    this.addSql(`alter table if exists "loyalty_point" drop constraint if exists "loyalty_point_customer_id_unique";`);
    this.addSql(`alter table if exists "loyalty_entry" drop constraint if exists "loyalty_entry_operation_key_unique";`);
    this.addSql(`create table if not exists "loyalty_entry" ("id" text not null, "operation_key" text not null, "customer_id" text not null, "points" integer not null, "state" text check ("state" in ('applied', 'reversed')) not null default 'applied', "attempt_token" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "loyalty_entry_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_loyalty_entry_operation_key_unique" ON "loyalty_entry" ("operation_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_loyalty_entry_deleted_at" ON "loyalty_entry" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "loyalty_point" ("id" text not null, "customer_id" text not null, "points" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "loyalty_point_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_loyalty_point_customer_id_unique" ON "loyalty_point" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_loyalty_point_deleted_at" ON "loyalty_point" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "loyalty_redemption" ("id" text not null, "cart_id" text not null, "customer_id" text not null, "promotion_id" text not null, "points" integer not null, "active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "loyalty_redemption_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_loyalty_redemption_cart_id_unique" ON "loyalty_redemption" ("cart_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_loyalty_redemption_promotion_id_unique" ON "loyalty_redemption" ("promotion_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_loyalty_redemption_deleted_at" ON "loyalty_redemption" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "loyalty_entry" cascade;`);

    this.addSql(`drop table if exists "loyalty_point" cascade;`);

    this.addSql(`drop table if exists "loyalty_redemption" cascade;`);
  }

}
