"""
Magni CLI — emergency account management.
Run inside the backend container:

  docker compose exec backend python -m app.cli reset-password --email you@example.com --password newpassword
  docker compose exec backend python -m app.cli create-user --email you@example.com --password newpassword --name "Your Name"
  docker compose exec backend python -m app.cli list-users
"""
import argparse
import asyncio
import sys

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.models import User
from app.core.security import hash_password


async def cmd_reset_password(email: str, password: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user:
            print(f"ERROR: No user found with email '{email}'")
            sys.exit(1)
        user.hashed_password = hash_password(password)
        await db.commit()
        print(f"OK: Password reset for {email}")


async def cmd_create_user(email: str, password: str, name: str):
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none():
            print(f"ERROR: User '{email}' already exists")
            sys.exit(1)
        user = User(
            email=email,
            hashed_password=hash_password(password),
            display_name=name,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        print(f"OK: User created — {email} ({name})")


async def cmd_list_users():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).order_by(User.created_at))
        users = result.scalars().all()
        if not users:
            print("No users found.")
            return
        for u in users:
            status = "active" if u.is_active else "disabled"
            print(f"  {u.email}  |  {u.display_name}  |  {status}  |  created {u.created_at.date()}")


def main():
    parser = argparse.ArgumentParser(description="Magni CLI — emergency account management")
    sub = parser.add_subparsers(dest="command")

    # reset-password
    rp = sub.add_parser("reset-password", help="Reset a user's password")
    rp.add_argument("--email", required=True)
    rp.add_argument("--password", required=True)

    # create-user
    cu = sub.add_parser("create-user", help="Create a new user account")
    cu.add_argument("--email", required=True)
    cu.add_argument("--password", required=True)
    cu.add_argument("--name", required=True)

    # list-users
    sub.add_parser("list-users", help="List all user accounts")

    args = parser.parse_args()

    if args.command == "reset-password":
        asyncio.run(cmd_reset_password(args.email, args.password))
    elif args.command == "create-user":
        asyncio.run(cmd_create_user(args.email, args.password, args.name))
    elif args.command == "list-users":
        asyncio.run(cmd_list_users())
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
