import io
import json
import uuid

from minio import Minio
from minio.error import S3Error


def _client() -> tuple["Minio", str]:
    from ..core.config import settings

    endpoint = settings.MINIO_ENDPOINT.replace("https://", "").replace("http://", "")
    secure = bool(settings.MINIO_USE_SSL)
    client = Minio(
        endpoint,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=secure,
    )
    return client, settings.MINIO_BUCKET


def ensure_bucket() -> None:
    client, bucket = _client()
    try:
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
        # Set public-read policy so URLs are accessible directly
        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"AWS": ["*"]},
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{bucket}/*"],
                }
            ],
        }
        client.set_bucket_policy(bucket, json.dumps(policy))
    except S3Error:
        pass


def delete_object(object_name: str) -> None:
    client, bucket = _client()
    try:
        client.remove_object(bucket, object_name)
    except S3Error:
        pass


def upload(data: bytes, object_name: str, content_type: str) -> str:
    from ..core.config import settings

    client, bucket = _client()
    client.put_object(
        bucket,
        object_name,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    endpoint = settings.MINIO_ENDPOINT.rstrip("/")
    return f"{endpoint}/{bucket}/{object_name}"
