from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.user import User


def get_current_user(
    x_user_id: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not x_user_id:
        raise HTTPException(
            status_code=401,
            detail="User ID is required",
        )

    user = db.get(User, x_user_id)

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid user ID",
        )

    return user