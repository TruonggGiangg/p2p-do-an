import numpy as np
import torch

def l1_distance(x: torch.Tensor, y: torch.Tensor, reduction="sum") -> torch.Tensor:

    assert reduction in ["sum", "mean"]

    dis = torch.abs(x - y)

    if reduction == "mean":
        return torch.mean(dis)
    else:
        return torch.sum(dis)


def euclidean_distance(x: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
    dis = torch.sqrt(torch.sum(torch.square(x - y)))
    return dis


def cosine_distance(x: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
    x = x.view(-1)
    y = y.view(-1)
    dot_product = torch.dot(x, y)

    norm_x = torch.norm(x.float())
    norm_y = torch.norm(y.float())

    dis = dot_product / (norm_x * norm_y)

    rad = torch.math.acos(dis)

    return rad


def find_threshold(model_name: str, distance_metric: str) -> float:
    base_threshold = {"cosine": 0.40, "euclidean": 0.55, "L1": 0.75}

    thresholds = {
        "VGG-Face1": {"cosine": 0.40, "euclidean": 0.31, "L1": 1.1},
        # In this case, I just tested the threshold for Lư distance
        "VGG-Face2": {"cosine": 0.40, "euclidean": 0.85, "L1": 1.4},
    }

    threshold = thresholds.get(model_name, base_threshold).get(distance_metric, 0.6)

    return threshold
