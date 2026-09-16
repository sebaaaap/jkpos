from pydantic import BaseModel, model_validator
from uuid import UUID
from datetime import datetime
from typing import List, Optional
from decimal import Decimal
from app.schemas.customers import CustomerResponse, VehicleResponse

class QuoteItemCreate(BaseModel):
    product_id: Optional[UUID] = None
    # Ítem virtual ("target"): línea de cotización sin producto de inventario.
    # Requiere virtual_name; se puede editar nombre/cantidad/precio libremente.
    virtual_name: Optional[str] = None
    is_virtual: bool = False
    quantity: Decimal
    unit_price: Decimal
    consumption_rate: Decimal = Decimal('1.0')

    @model_validator(mode='after')
    def _validate_item(self):
        if self.is_virtual or self.product_id is None:
            if not (self.virtual_name and self.virtual_name.strip()):
                raise ValueError('Ítem virtual requiere virtual_name')
            self.is_virtual = True
            self.product_id = None
        return self

class QuoteItemResponse(BaseModel):
    id: UUID
    product_id: Optional[UUID] = None
    product_name: str
    product_type: str
    is_virtual: bool = False
    quantity: Decimal
    unit_price: Decimal
    consumption_rate: Decimal = Decimal('1.0')
    stock_reduced: Decimal = Decimal('0.0')
    subtotal: Decimal
    
    class Config:
        from_attributes = True

class QuoteCreate(BaseModel):
    customer_id: UUID
    vehicle_id: Optional[UUID] = None
    mileage: Optional[Decimal] = None
    items: List[QuoteItemCreate]
    service_info: Optional[dict] = None
    is_ot: bool = False

class QuoteResponse(BaseModel):
    id: UUID
    customer_id: UUID
    vehicle_id: Optional[UUID] = None
    total: Decimal
    mileage: Optional[Decimal] = None
    state: str
    service_info: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
    items: List[QuoteItemResponse] = []
    customer: Optional[CustomerResponse] = None
    vehicle: Optional[VehicleResponse] = None
    
    class Config:
        from_attributes = True

class QuoteUpdateState(BaseModel):
    state: str
